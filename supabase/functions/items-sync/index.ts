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

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startTime = Date.now();

  try {
    if (!UEX_API_KEY) throw new Error('UEX_API_KEY is not configured');
    console.log('[items-sync] Starting...');

    // Fetch categories first to know which IDs to query
    console.log('[items-sync] Fetching categories...');
    const categoriesData = await fetchUEX('categories');
    
    // Filter to item categories (not commodity, not vehicle)
    const itemCategories = categoriesData.filter((c: any) => 
      c.section === 'items' || c.type === 'item'
    );
    console.log(`[items-sync] Found ${itemCategories.length} item categories`);

    let totalItems = 0;
    const allItems: any[] = [];

    // Fetch items per category
    for (const cat of itemCategories) {
      try {
        const items = await fetchUEX(`items?id_category=${cat.id}`);
        if (Array.isArray(items)) {
          for (const item of items) {
            allItems.push({
              uex_id: item.id,
              name: item.name,
              slug: item.slug || slugify(item.name),
              category: item.section || item.category || cat.name || null,
              sub_category: item.category || null,
              manufacturer: item.company_name || null,
              size: item.size || null,
              grade: item.quality ? `Grade ${item.quality}` : null,
              uuid: item.uuid || null,
              updated_at: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        console.warn(`[items-sync] Failed to fetch category ${cat.id} (${cat.name}):`, e);
      }
    }

    console.log(`[items-sync] Got ${allItems.length} total items`);

    // Upsert items in batches
    let itemsUpserted = 0;
    for (let i = 0; i < allItems.length; i += 100) {
      const batch = allItems.slice(i, i + 100);
      const { error } = await supabase
        .from('game_items')
        .upsert(batch, { onConflict: 'uex_id', ignoreDuplicates: false });
      if (!error) itemsUpserted += batch.length;
      else console.error(`[items-sync] Batch error at ${i}:`, error.message);
    }

    // Now fetch item prices
    console.log('[items-sync] Fetching item prices...');
    try {
      const pricesData = await fetchUEX('items_prices_all');
      console.log(`[items-sync] Got ${pricesData.length} price entries`);

      // Build uex_id -> db_id map
      const { data: dbItems } = await supabase.from('game_items').select('id, uex_id');
      const itemMap = new Map<number, number>();
      for (const it of dbItems || []) {
        if (it.uex_id) itemMap.set(it.uex_id, it.id);
      }

      // Aggregate prices by item (avg buy/sell across all terminals)
      const priceAgg = new Map<number, { buys: number[]; sells: number[] }>();
      for (const p of pricesData) {
        const dbId = itemMap.get(p.id_item);
        if (!dbId) continue;
        if (!priceAgg.has(dbId)) priceAgg.set(dbId, { buys: [], sells: [] });
        const agg = priceAgg.get(dbId)!;
        if (p.price_buy > 0) agg.buys.push(p.price_buy);
        if (p.price_sell > 0) agg.sells.push(p.price_sell);
      }

      // Update items with avg prices
      let pricesUpdated = 0;
      for (const [dbId, agg] of priceAgg) {
        const avgBuy = agg.buys.length > 0 ? agg.buys.reduce((a, b) => a + b, 0) / agg.buys.length : null;
        const avgSell = agg.sells.length > 0 ? agg.sells.reduce((a, b) => a + b, 0) / agg.sells.length : null;
        const { error } = await supabase.from('game_items').update({
          buy_price_avg: avgBuy, sell_price_avg: avgSell,
        }).eq('id', dbId);
        if (!error) pricesUpdated++;
      }
      console.log(`[items-sync] Updated prices for ${pricesUpdated} items`);
    } catch (e) {
      console.warn('[items-sync] Failed to fetch prices:', e);
    }

    const duration = Date.now() - startTime;
    console.log(`[items-sync] Done in ${duration}ms: ${itemsUpserted} items`);

    await supabase.from('cron_job_history').insert({
      job_name: 'items-sync', status: 'success',
      items_synced: itemsUpserted, duration_ms: duration,
    });

    return new Response(JSON.stringify({
      status: 'ok', items: itemsUpserted, duration_ms: duration,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[items-sync] Error:', error);
    await supabase.from('cron_job_history').insert({
      job_name: 'items-sync', status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ status: 'error', message: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
