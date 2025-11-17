import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const FUNCTION_NAME = 'new-ships-sync';
  const LOCK_DURATION = 300; // 5 minutes max

  try {
    console.log(`[${FUNCTION_NAME}] Attempting to acquire lock...`);

    // Try to acquire lock
    const { data: lockAcquired, error: lockError } = await supabase
      .rpc('acquire_function_lock', {
        p_function_name: FUNCTION_NAME,
        p_lock_duration_seconds: LOCK_DURATION
      });

    if (lockError) {
      console.error(`[${FUNCTION_NAME}] Lock error:`, lockError);
      throw lockError;
    }

    if (!lockAcquired) {
      console.log(`[${FUNCTION_NAME}] Another instance is already running. Skipping.`);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Another instance is already running',
          skipped: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log(`[${FUNCTION_NAME}] Lock acquired. Starting sync...`);

    const startTime = Date.now();
    let itemsSynced = 0;
    let errorMessage = null;

    try {
      // Get ships that became flight ready in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentShips, error: fetchError } = await supabase
        .from('ships')
        .select('*')
        .gte('flight_ready_since', sevenDaysAgo.toISOString())
        .not('flight_ready_since', 'is', null)
        .order('flight_ready_since', { ascending: false })
        .limit(50);

      if (fetchError) {
        console.error('Error fetching ships:', fetchError);
        throw fetchError;
      }

      console.log(`Found ${recentShips?.length || 0} ships that became flight ready in last 7 days`);

      if (!recentShips || recentShips.length === 0) {
        console.log('No ships became flight ready recently');
      } else {
        // Create news entries for newly flight ready ships
        for (const ship of recentShips) {
          // Use slug only in hash so we only create one news per ship becoming flight ready
          const hash = `ship_flight_ready_${ship.slug}`;
          
          // Check if we already have news for this ship
          const { data: existingNews } = await supabase
            .from('news')
            .select('id')
            .eq('hash', hash)
            .maybeSingle();

          if (existingNews) {
            console.log(`News already exists for ${ship.name}`);
            continue;
          }

          // Build specs section
          const specs = [];
          if (ship.manufacturer) specs.push(`**Manufacturer:** ${ship.manufacturer}`);
          if (ship.role) specs.push(`**Role:** ${ship.role}`);
          if (ship.size) specs.push(`**Size:** ${ship.size}`);
          if (ship.length_m) specs.push(`**Length:** ${ship.length_m}m`);
          if (ship.beam_m) specs.push(`**Beam:** ${ship.beam_m}m`);
          if (ship.height_m) specs.push(`**Height:** ${ship.height_m}m`);
          if (ship.crew_min && ship.crew_max) specs.push(`**Crew:** ${ship.crew_min}-${ship.crew_max}`);
          if (ship.cargo_scu) specs.push(`**Cargo:** ${ship.cargo_scu} SCU`);
          if (ship.max_speed) specs.push(`**Max Speed:** ${ship.max_speed} m/s`);

          const newsContent = `## ${ship.name}

🚀 **Now Flight Ready!**

${ship.production_status ? `**Status:** ${ship.production_status}` : ''}

${specs.join('\n')}

[View Ship Details](/ships/${ship.slug})
`;

          const { error } = await supabase
            .from('news')
            .insert({
              hash,
              title: `Flight Ready: ${ship.name}`,
              excerpt: `The ${ship.name} by ${ship.manufacturer || 'Unknown'} is now flight ready in Star Citizen!`,
              content_md: newsContent,
              category: 'New Ships',
              published_at: ship.updated_at,
              source: JSON.stringify({
                source: 'database-ships',
                url: `/ships/${ship.slug}`,
                ts: new Date().toISOString(),
              }),
              source_url: `/ships/${ship.slug}`,
              image_url: ship.image_url,
            });

          if (error) {
            if (error.code === '23505') { // Duplicate key
              console.log(`News already exists for ${ship.name} (duplicate key)`);
            } else {
              console.error(`Error creating news for ${ship.name}:`, error);
            }
          } else {
            itemsSynced++;
            console.log(`Created Flight Ready news for: ${ship.name}`);
          }
        }
      }

    } catch (error) {
      console.error(`[${FUNCTION_NAME}] Error during sync:`, error);
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      // Always release the lock
      try {
        await supabase.rpc('release_function_lock', {
          p_function_name: FUNCTION_NAME
        });
        console.log(`[${FUNCTION_NAME}] Lock released`);
      } catch (unlockError) {
        console.error(`[${FUNCTION_NAME}] Error releasing lock:`, unlockError);
      }
    }

    // Log to cron_job_history
    const duration = Date.now() - startTime;
    await supabase.from('cron_job_history').insert({
      job_name: FUNCTION_NAME,
      status: errorMessage ? 'error' : 'success',
      items_synced: itemsSynced,
      duration_ms: duration,
      error_message: errorMessage,
    });

    console.log(`[${FUNCTION_NAME}] Sync completed. Items: ${itemsSynced}, Duration: ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: !errorMessage,
        itemsSynced,
        duration,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: errorMessage ? 500 : 200,
      }
    );

  } catch (error) {
    console.error(`[${FUNCTION_NAME}] Fatal error:`, error);
    
    // Try to release lock even on fatal error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase.rpc('release_function_lock', {
        p_function_name: FUNCTION_NAME
      });
    } catch (unlockError) {
      console.error(`[${FUNCTION_NAME}] Error releasing lock after fatal error:`, unlockError);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
