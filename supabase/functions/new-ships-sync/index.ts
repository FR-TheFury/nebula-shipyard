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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting new ships sync...');

    const startTime = Date.now();
    let itemsSynced = 0;
    let errorMessage = null;

    try {
      // Get ships that have been added in the last 7 days and are Flight Ready
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentShips, error: fetchError } = await supabase
        .from('ships')
        .select('*')
        .gte('updated_at', sevenDaysAgo.toISOString())
        .or('production_status.ilike.%flight ready%,production_status.ilike.%released%,production_status.ilike.%flyable%')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        console.error('Error fetching ships:', fetchError);
        throw fetchError;
      }

      console.log(`Found ${recentShips?.length || 0} flight ready ships in last 7 days`);

      if (!recentShips || recentShips.length === 0) {
        console.log('No recent flight ready ships to process');
      } else {
        // Create news entries for recently flight ready ships
        for (const ship of recentShips) {
          const hash = `ship_flight_ready_${ship.slug}_${ship.updated_at}`;
          
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
      console.error('Error during new ships sync:', error);
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    // Log to cron_job_history
    const duration = Date.now() - startTime;
    await supabase.from('cron_job_history').insert({
      job_name: 'new-ships-sync',
      status: errorMessage ? 'error' : 'success',
      items_synced: itemsSynced,
      duration_ms: duration,
      error_message: errorMessage,
    });

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
    console.error('New ships sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
