import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UEX_API_KEY = Deno.env.get('UEX_API_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const UEX_BASE = 'https://api.uexcorp.space/2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchUEX(endpoint: string): Promise<any> {
  const res = await fetch(`${UEX_BASE}/${endpoint}`, {
    headers: { 'Authorization': `Bearer ${UEX_API_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`UEX API error ${res.status} for /${endpoint}`);
  const json = await res.json();
  if (json.status !== 'ok') throw new Error(`UEX status: ${json.status} for /${endpoint}`);
  return json.data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startTime = Date.now();

  try {
    if (!UEX_API_KEY) throw new Error('UEX_API_KEY is not configured');
    console.log('[mining-sync] Starting...');

    // Build commodity uex_id -> db_id map
    const { data: dbCommodities } = await supabase.from('commodities').select('id, uex_id, name');
    const commodityMap = new Map<number, { id: number; name: string }>();
    for (const c of dbCommodities || []) {
      if (c.uex_id) commodityMap.set(c.uex_id, { id: c.id, name: c.name });
    }

    // Build terminal uex_id -> db_id map
    const { data: dbTerminals } = await supabase.from('terminals').select('id, uex_id');
    const terminalMap = new Map<number, number>();
    for (const t of dbTerminals || []) {
      if (t.uex_id) terminalMap.set(t.uex_id, t.id);
    }

    // ===== STEP 1: Fetch refinery methods =====
    console.log('[mining-sync] Fetching refinery methods...');
    const methodsData = await fetchUEX('refineries_methods');
    console.log(`[mining-sync] Got ${methodsData.length} refinery methods`);

    const methodRows = methodsData.map((m: any) => ({
      name: m.name,
      duration_modifier: m.rating_speed || 1,
      cost_modifier: m.rating_cost || 1,
      yield_modifier: m.rating_yield || 1,
      updated_at: new Date().toISOString(),
    }));

    let methodsUpserted = 0;
    for (const row of methodRows) {
      const { error } = await supabase.from('refinery_methods').upsert(row, { onConflict: 'name' });
      if (!error) methodsUpserted++;
      else console.error('[mining-sync] Method error:', error.message);
    }

    // Build method name -> db_id map
    const { data: dbMethods } = await supabase.from('refinery_methods').select('id, name');
    const methodMap = new Map<string, number>();
    for (const m of dbMethods || []) { methodMap.set(m.name, m.id); }

    // ===== STEP 2: Fetch refinery yields =====
    console.log('[mining-sync] Fetching refinery yields...');
    const yieldsData = await fetchUEX('refineries_yields');
    console.log(`[mining-sync] Got ${yieldsData.length} yield entries`);

    // We'll store yields as mining_resources (commodity at location) + refinery_yields
    const miningResourcesMap = new Map<string, any>();
    const yieldRows: any[] = [];

    for (const y of yieldsData) {
      const commodity = commodityMap.get(y.id_commodity);
      const terminalId = terminalMap.get(y.id_terminal);
      if (!commodity) continue;

      // Create a mining resource entry per commodity+location
      const locKey = `${y.id_commodity}-${y.star_system_name || ''}-${y.planet_name || ''}-${y.moon_name || ''}`;
      if (!miningResourcesMap.has(locKey)) {
        miningResourcesMap.set(locKey, {
          commodity_id: commodity.id,
          location_type: 'asteroid', // Default - refined at station
          star_system: y.star_system_name || null,
          planet: y.planet_name || null,
          moon: y.moon_name || null,
          concentration_pct: null,
          rarity: null,
          updated_at: new Date().toISOString(),
        });
      }

      // Store yield data (we'll link to methods later)
      if (terminalId) {
        yieldRows.push({
          commodity_id: commodity.id,
          terminal_id: terminalId,
          yield_pct: y.value || null,
          duration_seconds: null,
          cost_auec: null,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Upsert mining resources
    let miningUpserted = 0;
    const miningRows = Array.from(miningResourcesMap.values());
    for (let i = 0; i < miningRows.length; i += 100) {
      const batch = miningRows.slice(i, i + 100);
      const { error } = await supabase.from('mining_resources').insert(batch);
      if (!error) miningUpserted += batch.length;
      else console.error('[mining-sync] Mining resource error:', error.message);
    }

    // For refinery_yields, we need to link to a method. 
    // Since yields data doesn't specify method, assign first method as default
    const defaultMethodId = dbMethods?.[0]?.id;
    let yieldsUpserted = 0;
    if (defaultMethodId) {
      for (let i = 0; i < yieldRows.length; i += 100) {
        const batch = yieldRows.slice(i, i + 100).map(y => ({
          ...y,
          method_id: defaultMethodId,
        }));
        const { error } = await supabase.from('refinery_yields').insert(batch);
        if (!error) yieldsUpserted += batch.length;
        else console.error('[mining-sync] Yield error:', error.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[mining-sync] Done in ${duration}ms: ${methodsUpserted} methods, ${miningUpserted} resources, ${yieldsUpserted} yields`);

    await supabase.from('cron_job_history').insert({
      job_name: 'mining-sync',
      status: 'success',
      items_synced: methodsUpserted + miningUpserted + yieldsUpserted,
      duration_ms: duration,
    });

    return new Response(JSON.stringify({
      status: 'ok', methods: methodsUpserted, mining_resources: miningUpserted,
      yields: yieldsUpserted, duration_ms: duration,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[mining-sync] Error:', error);
    await supabase.from('cron_job_history').insert({
      job_name: 'mining-sync', status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ status: 'error', message: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
