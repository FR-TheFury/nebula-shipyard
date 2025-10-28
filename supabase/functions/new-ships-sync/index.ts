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
      // Get ships added to our DB in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentShips, error: fetchError } = await supabase
        .from('ships')
        .select('*')
        .gte('updated_at', thirtyDaysAgo.toISOString())
        .order('updated_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        console.error('Error fetching ships:', fetchError);
        throw fetchError;
      }

      console.log(`Found ${recentShips?.length || 0} ships updated in last 30 days`);

      if (!recentShips || recentShips.length === 0) {
        console.log('No recent ships to process');
      } else {
        // Create news entries for recent ships
        for (const ship of recentShips) {
          const hash = `ship_new_ships_${ship.slug}_${ship.updated_at}`;
          
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

          const newsContent = `## ${ship.name}

🆕 **New Ship**

**Manufacturer:** ${ship.manufacturer || 'Unknown'}
**Role:** ${ship.role || 'Unknown'}
**Size:** ${ship.size || 'Unknown'}

${ship.length_m ? `**Length:** ${ship.length_m}m` : ''}
${ship.beam_m ? `**Beam:** ${ship.beam_m}m` : ''}
${ship.height_m ? `**Height:** ${ship.height_m}m` : ''}
${ship.crew_min && ship.crew_max ? `**Crew:** ${ship.crew_min}-${ship.crew_max}` : ''}
${ship.cargo_scu ? `**Cargo:** ${ship.cargo_scu} SCU` : ''}
${ship.max_speed ? `**Max Speed:** ${ship.max_speed} m/s` : ''}

[View Ship Details](/ships/${ship.slug})
`;

          const { error } = await supabase
            .from('news')
            .insert({
              hash,
              title: `New Ship: ${ship.name}`,
              excerpt: `A new ship has been added to Star Citizen: ${ship.name} by ${ship.manufacturer || 'Unknown'}`,
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
            console.log(`Created New Ships news for: ${ship.name}`);
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
