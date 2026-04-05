import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SCUnpacked GitHub raw URLs for mission-related data
const SCUNPACKED_BASE = 'https://raw.githubusercontent.com/StarCitizenTools/scunpacked/master/website/data';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startTime = Date.now();

  try {
    console.log('[missions-sync] Starting...');

    // Try fetching mission data from SCUnpacked
    // Note: SCUnpacked doesn't have a dedicated missions file, so we'll use a community source
    // For now, we'll seed with known mission categories from Star Citizen
    const knownMissions = [
      // Bounty missions
      { title: 'Bounty - Very Low Threat', category: 'bounty', mission_type: 'combat', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 7500, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'very_low', rank_required: 'None' },
      { title: 'Bounty - Low Threat', category: 'bounty', mission_type: 'combat', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 15000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'low', rank_required: 'None' },
      { title: 'Bounty - Medium Threat', category: 'bounty', mission_type: 'combat', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 25000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'medium', rank_required: 'Tier 1' },
      { title: 'Bounty - High Threat (HRT)', category: 'bounty', mission_type: 'combat', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 40000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'high', rank_required: 'Tier 2' },
      { title: 'Bounty - Very High Threat (VHRT)', category: 'bounty', mission_type: 'combat', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 60000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'very_high', rank_required: 'Tier 3' },
      { title: 'Bounty - Extreme Risk Targets (ERT)', category: 'bounty', mission_type: 'combat', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 100000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'extreme', rank_required: 'Tier 4' },
      { title: 'Group Bounty - VHRT', category: 'bounty', mission_type: 'combat', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 90000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'very_high', rank_required: 'Tier 3' },
      
      // Delivery
      { title: 'Delivery - Local', category: 'delivery', mission_type: 'transport', faction: 'Covalex Shipping', star_system: 'Stanton', reward_auec: 6000, is_illegal: false, is_shareable: false, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      { title: 'Delivery - Interplanetary', category: 'delivery', mission_type: 'transport', faction: 'Covalex Shipping', star_system: 'Stanton', reward_auec: 12000, is_illegal: false, is_shareable: false, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      { title: 'Drug Delivery', category: 'delivery', mission_type: 'transport', faction: 'Underground', star_system: 'Stanton', reward_auec: 25000, is_illegal: true, is_shareable: false, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      
      // Mining
      { title: 'Mining Contract - Quantanium', category: 'mining', mission_type: 'resource', faction: 'Shubin Interstellar', star_system: 'Stanton', reward_auec: 45000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      { title: 'Mining Contract - Hadanite', category: 'mining', mission_type: 'resource', faction: 'Shubin Interstellar', star_system: 'Stanton', reward_auec: 30000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      
      // Salvage
      { title: 'Salvage Contract - Wreckage', category: 'salvage', mission_type: 'salvage', faction: 'Reclaimer Association', star_system: 'Stanton', reward_auec: 20000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      { title: 'Illegal Salvage', category: 'salvage', mission_type: 'salvage', faction: 'Underground', star_system: 'Stanton', reward_auec: 35000, is_illegal: true, is_shareable: false, is_repeatable: true, combat_threat: 'low', rank_required: 'None' },
      
      // Investigation
      { title: 'Missing Person Investigation', category: 'investigation', mission_type: 'exploration', faction: 'microTech Security', star_system: 'Stanton', reward_auec: 15000, is_illegal: false, is_shareable: false, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      { title: 'Black Box Recovery', category: 'investigation', mission_type: 'exploration', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 10000, is_illegal: false, is_shareable: false, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      
      // Mercenary
      { title: 'Bunker Clearance', category: 'mercenary', mission_type: 'combat', faction: 'Hurston Security', star_system: 'Stanton', reward_auec: 20000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'medium', rank_required: 'Tier 1' },
      { title: 'Defend Outpost', category: 'mercenary', mission_type: 'combat', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 35000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'high', rank_required: 'Tier 2' },
      { title: 'Raid Security Post', category: 'mercenary', mission_type: 'combat', faction: 'Underground', star_system: 'Stanton', reward_auec: 30000, is_illegal: true, is_shareable: true, is_repeatable: true, combat_threat: 'high', rank_required: 'Tier 2' },
      
      // Maintenance
      { title: 'Repair Relay Station', category: 'maintenance', mission_type: 'maintenance', faction: 'Comm-Array', star_system: 'Stanton', reward_auec: 8000, is_illegal: false, is_shareable: false, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      { title: 'Disable Comm Array', category: 'maintenance', mission_type: 'maintenance', faction: 'Underground', star_system: 'Stanton', reward_auec: 20000, is_illegal: true, is_shareable: false, is_repeatable: true, combat_threat: null, rank_required: 'None' },
      
      // Escort
      { title: 'Escort - Transport Ship', category: 'escort', mission_type: 'combat', faction: 'Covalex Shipping', star_system: 'Stanton', reward_auec: 30000, is_illegal: false, is_shareable: true, is_repeatable: true, combat_threat: 'medium', rank_required: 'Tier 1' },
      
      // Search & Rescue
      { title: 'Search and Rescue', category: 'search_rescue', mission_type: 'exploration', faction: 'Crusader Security', star_system: 'Stanton', reward_auec: 12000, is_illegal: false, is_shareable: false, is_repeatable: true, combat_threat: null, rank_required: 'None' },
    ];

    // Upsert missions with source_id for dedup
    let missionsUpserted = 0;
    for (const mission of knownMissions) {
      const sourceId = `seed-${mission.category}-${mission.title.toLowerCase().replace(/\s+/g, '-')}`;
      const { error } = await supabase.from('missions').upsert({
        ...mission,
        source_id: sourceId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'source_id' });
      if (!error) missionsUpserted++;
      else console.error(`[missions-sync] Error:`, error.message);
    }

    const duration = Date.now() - startTime;
    console.log(`[missions-sync] Done in ${duration}ms: ${missionsUpserted} missions`);

    await supabase.from('cron_job_history').insert({
      job_name: 'missions-sync', status: 'success',
      items_synced: missionsUpserted, duration_ms: duration,
    });

    return new Response(JSON.stringify({
      status: 'ok', missions: missionsUpserted, duration_ms: duration,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[missions-sync] Error:', error);
    await supabase.from('cron_job_history').insert({
      job_name: 'missions-sync', status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ status: 'error', message: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
