import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FUNCTION_NAME = 'cleanup-raw-data';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const startTime = Date.now();
  let jobHistoryId: number | null = null;

  try {
    console.log(`[${FUNCTION_NAME}] Starting cleanup of old raw_*_data...`);

    // Acquire function lock to prevent concurrent runs
    const { data: lockAcquired } = await supabase.rpc('acquire_function_lock', {
      p_function_name: FUNCTION_NAME,
      p_lock_duration_seconds: 1800 // 30 minutes
    });

    if (!lockAcquired) {
      console.log(`[${FUNCTION_NAME}] Another instance is already running. Exiting.`);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          message: 'Another cleanup job is already running' 
        }),
        { 
          status: 409, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create job history entry
    const { data: jobHistory } = await supabase
      .from('cron_job_history')
      .insert({
        job_name: FUNCTION_NAME,
        status: 'running'
      })
      .select('id')
      .single();
    
    jobHistoryId = jobHistory?.id || null;

    // Get ships modified in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: recentShips, error: selectError } = await supabase
      .from('ships')
      .select('slug')
      .gte('updated_at', thirtyDaysAgo);

    if (selectError) throw selectError;

    const recentSlugs = recentShips?.map(s => s.slug) || [];
    console.log(`[${FUNCTION_NAME}] Found ${recentSlugs.length} ships updated in last 30 days`);

    // Clear raw_*_data for ships NOT in the recent list
    let cleanedCount = 0;
    
    if (recentSlugs.length > 0) {
      const { data: oldShips, error: oldShipsError } = await supabase
        .from('ships')
        .select('slug')
        .not('slug', 'in', `(${recentSlugs.map(s => `'${s}'`).join(',')})`);

      if (oldShipsError) throw oldShipsError;

      if (oldShips && oldShips.length > 0) {
        const oldSlugs = oldShips.map(s => s.slug);
        
        const { error: updateError } = await supabase
          .from('ships')
          .update({
            raw_wiki_data: null,
            raw_fleetyards_data: null,
            raw_starcitizen_api_data: null
          })
          .in('slug', oldSlugs);

        if (updateError) throw updateError;
        
        cleanedCount = oldSlugs.length;
        console.log(`[${FUNCTION_NAME}] ✓ Cleaned raw data for ${cleanedCount} ships not updated in 30+ days`);
      } else {
        console.log(`[${FUNCTION_NAME}] No old ships to clean`);
      }
    } else {
      // If no recent ships, clean all
      const { error: updateError } = await supabase
        .from('ships')
        .update({
          raw_wiki_data: null,
          raw_fleetyards_data: null,
          raw_starcitizen_api_data: null
        })
        .not('slug', 'eq', ''); // Update all

      if (updateError) throw updateError;

      const { count } = await supabase
        .from('ships')
        .select('slug', { count: 'exact', head: true });
      
      cleanedCount = count || 0;
      console.log(`[${FUNCTION_NAME}] ✓ Cleaned raw data for all ${cleanedCount} ships`);
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      action: 'cleanup_raw_data',
      target: 'ships',
      meta: {
        cleaned_count: cleanedCount,
        kept_count: recentSlugs.length,
        timestamp: new Date().toISOString()
      }
    });

    // Update job history to success
    if (jobHistoryId) {
      await supabase
        .from('cron_job_history')
        .update({
          status: 'success',
          items_synced: cleanedCount,
          duration_ms: Date.now() - startTime
        })
        .eq('id', jobHistoryId);
    }

    // Release lock
    await supabase.rpc('release_function_lock', {
      p_function_name: FUNCTION_NAME
    });

    console.log(`[${FUNCTION_NAME}] Cleanup completed successfully`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        cleaned: cleanedCount,
        kept: recentSlugs.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error(`[${FUNCTION_NAME}] Cleanup error:`, error);

    // Update job history to failed
    if (jobHistoryId) {
      await supabase
        .from('cron_job_history')
        .update({
          status: 'failed',
          error_message: (error as Error).message,
          duration_ms: Date.now() - startTime
        })
        .eq('id', jobHistoryId);
    }

    // Release lock on error
    try {
      await supabase.rpc('release_function_lock', {
        p_function_name: FUNCTION_NAME
      });
    } catch (releaseError) {
      console.error(`[${FUNCTION_NAME}] Error releasing lock:`, releaseError);
    }

    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: (error as Error).message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
