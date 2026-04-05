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
    headers: {
      'Authorization': `Bearer ${UEX_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`UEX API error ${res.status} for /${endpoint}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.status !== 'ok') {
    throw new Error(`UEX API returned status: ${json.status} for /${endpoint}`);
  }
  return json.data;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    if (!UEX_API_KEY) {
      throw new Error('UEX_API_KEY is not configured');
    }

    console.log('[commodities-sync] Starting sync...');

    // ===== STEP 1: Fetch terminals =====
    console.log('[commodities-sync] Fetching terminals...');
    const terminalsData = await fetchUEX('terminals');
    console.log(`[commodities-sync] Got ${terminalsData.length} terminals`);

    // Upsert terminals
    const terminalRows = terminalsData.map((t: any) => ({
      uex_id: t.id,
      name: t.name || t.nickname || 'Unknown',
      slug: slugify(t.name || t.nickname || `terminal-${t.id}`),
      type: t.type || null,
      location_type: t.is_refinery ? 'refinery' : (t.is_cargo_center ? 'cargo_center' : null),
      star_system: t.star_system_name || null,
      planet: t.planet_name || null,
      moon: t.moon_name || null,
      space_station: t.space_station_name || null,
      is_refinery: t.is_refinery === 1,
      updated_at: new Date().toISOString(),
    }));

    // Batch upsert terminals (100 at a time to avoid payload limits)
    let terminalsUpserted = 0;
    for (let i = 0; i < terminalRows.length; i += 100) {
      const batch = terminalRows.slice(i, i + 100);
      const { error } = await supabase
        .from('terminals')
        .upsert(batch, { onConflict: 'uex_id', ignoreDuplicates: false });
      if (error) {
        console.error(`[commodities-sync] Terminal batch error:`, error.message);
      } else {
        terminalsUpserted += batch.length;
      }
    }
    console.log(`[commodities-sync] Upserted ${terminalsUpserted} terminals`);

    // Build uex_id -> db_id map for terminals
    const { data: dbTerminals } = await supabase
      .from('terminals')
      .select('id, uex_id');
    const terminalMap = new Map<number, number>();
    for (const t of dbTerminals || []) {
      if (t.uex_id) terminalMap.set(t.uex_id, t.id);
    }

    // ===== STEP 2: Fetch commodities =====
    console.log('[commodities-sync] Fetching commodities...');
    const commoditiesData = await fetchUEX('commodities');
    console.log(`[commodities-sync] Got ${commoditiesData.length} commodities`);

    const commodityRows = commoditiesData.map((c: any) => ({
      uex_id: c.id,
      name: c.name,
      slug: c.slug || slugify(c.name),
      code: c.code || null,
      category: c.kind || null,
      is_raw: c.is_raw === 1,
      is_illegal: c.is_illegal === 1,
      is_harvestable: c.is_harvestable === 1,
      buy_price_avg: c.price_buy || null,
      sell_price_avg: c.price_sell || null,
      updated_at: new Date().toISOString(),
    }));

    let commoditiesUpserted = 0;
    for (let i = 0; i < commodityRows.length; i += 100) {
      const batch = commodityRows.slice(i, i + 100);
      const { error } = await supabase
        .from('commodities')
        .upsert(batch, { onConflict: 'uex_id', ignoreDuplicates: false });
      if (error) {
        console.error(`[commodities-sync] Commodity batch error:`, error.message);
      } else {
        commoditiesUpserted += batch.length;
      }
    }
    console.log(`[commodities-sync] Upserted ${commoditiesUpserted} commodities`);

    // Build uex_id -> db_id map for commodities
    const { data: dbCommodities } = await supabase
      .from('commodities')
      .select('id, uex_id');
    const commodityMap = new Map<number, number>();
    for (const c of dbCommodities || []) {
      if (c.uex_id) commodityMap.set(c.uex_id, c.id);
    }

    // ===== STEP 3: Fetch commodity prices =====
    console.log('[commodities-sync] Fetching commodity prices...');
    const pricesData = await fetchUEX('commodities_prices_all');
    console.log(`[commodities-sync] Got ${pricesData.length} price entries`);

    const priceRows: any[] = [];
    let skippedPrices = 0;
    for (const p of pricesData) {
      const commodityId = commodityMap.get(p.id_commodity);
      const terminalId = terminalMap.get(p.id_terminal);
      if (!commodityId || !terminalId) {
        skippedPrices++;
        continue;
      }
      priceRows.push({
        commodity_id: commodityId,
        terminal_id: terminalId,
        price_buy: p.price_buy || null,
        price_sell: p.price_sell || null,
        scu_buy: p.scu_buy ? Math.round(p.scu_buy) : null,
        scu_sell: p.scu_sell ? Math.round(p.scu_sell) : null,
        status: 'normal',
        updated_at: new Date().toISOString(),
      });
    }

    // Batch upsert prices (200 at a time)
    let pricesUpserted = 0;
    for (let i = 0; i < priceRows.length; i += 200) {
      const batch = priceRows.slice(i, i + 200);
      const { error } = await supabase
        .from('commodity_prices')
        .upsert(batch, { onConflict: 'commodity_id,terminal_id', ignoreDuplicates: false });
      if (error) {
        console.error(`[commodities-sync] Price batch error at ${i}:`, error.message);
      } else {
        pricesUpserted += batch.length;
      }
    }
    console.log(`[commodities-sync] Upserted ${pricesUpserted} prices (${skippedPrices} skipped)`);

    const duration = Date.now() - startTime;

    // Log to cron history
    await supabase.from('cron_job_history').insert({
      job_name: 'commodities-sync',
      status: 'success',
      items_synced: commoditiesUpserted + pricesUpserted + terminalsUpserted,
      duration_ms: duration,
    });

    // Log to audit
    await supabase.from('audit_logs').insert({
      action: 'commodities_sync',
      target: 'commodities',
      meta: {
        terminals: terminalsUpserted,
        commodities: commoditiesUpserted,
        prices: pricesUpserted,
        skipped_prices: skippedPrices,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[commodities-sync] Done in ${duration}ms`);

    return new Response(JSON.stringify({
      status: 'ok',
      terminals: terminalsUpserted,
      commodities: commoditiesUpserted,
      prices: pricesUpserted,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[commodities-sync] Error:', error);
    const duration = Date.now() - startTime;

    await supabase.from('cron_job_history').insert({
      job_name: 'commodities-sync',
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
      duration_ms: duration,
    });

    return new Response(JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
