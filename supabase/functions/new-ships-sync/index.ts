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
      // Get all existing ships from database
      const { data: existingShips, error: fetchError } = await supabase
        .from('ships')
        .select('slug, updated_at, source');

      if (fetchError) throw fetchError;

      const existingShipMap = new Map(
        existingShips?.map(s => [s.slug, s]) || []
      );

      // Fetch ships from API
      const apiKey = Deno.env.get('STARCITIZEN_API_KEY');
      const response = await fetch('https://api.starcitizen-api.com/v1/live/vehicles', {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const shipsData = await response.json();
      const ships = shipsData.data || [];

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Process each ship
      for (const ship of ships) {
        const slug = ship.slug || ship.name?.toLowerCase().replace(/\s+/g, '-');
        if (!slug) continue;

        const existingShip = existingShipMap.get(slug);
        const shipSourceTimestamp = ship.updated_at || ship.last_modified_date || new Date().toISOString();
        
        // Determine if this is a NEW ship or an UPDATE
        let category = 'Feature'; // Default to Feature (updates/patches)
        let isNew = false;

        if (!existingShip) {
          // Ship doesn't exist in our database = truly NEW
          const shipCreatedDate = new Date(ship.created_at || shipSourceTimestamp);
          if (shipCreatedDate > thirtyDaysAgo) {
            category = 'New Ships';
            isNew = true;
          }
        } else {
          // Ship exists - check if it was recently updated
          const lastUpdate = new Date(existingShip.updated_at);
          const sourceUpdate = new Date(shipSourceTimestamp);
          
          // If updated in last 30 days AND source shows a recent update = Feature (patch/update)
          if (sourceUpdate > lastUpdate && sourceUpdate > thirtyDaysAgo) {
            category = 'Feature';
            isNew = false;
          } else {
            // No recent changes, skip creating news item
            continue;
          }
        }

        // Create news item for new ship or update
        const hash = `ship_${category.toLowerCase().replace(/\s+/g, '_')}_${slug}_${shipSourceTimestamp}`;
        
        const newsTitle = isNew 
          ? `New Ship: ${ship.name}` 
          : `Ship Update: ${ship.name}`;
        
        const newsExcerpt = isNew
          ? `A new ship has been added to Star Citizen: ${ship.name} by ${ship.manufacturer}`
          : `${ship.name} has received updates`;

        const newsContent = `## ${ship.name}

${isNew ? '🆕 **New Ship Release**' : '🔄 **Ship Update**'}

**Manufacturer:** ${ship.manufacturer || 'Unknown'}
**Role:** ${ship.role || 'Unknown'}
**Size:** ${ship.size || 'Unknown'}

${ship.description || 'No description available'}

${ship.length_m ? `**Length:** ${ship.length_m}m` : ''}
${ship.beam_m ? `**Beam:** ${ship.beam_m}m` : ''}
${ship.height_m ? `**Height:** ${ship.height_m}m` : ''}
${ship.crew_min && ship.crew_max ? `**Crew:** ${ship.crew_min}-${ship.crew_max}` : ''}
${ship.cargo_scu ? `**Cargo:** ${ship.cargo_scu} SCU` : ''}
${ship.max_speed ? `**Max Speed:** ${ship.max_speed} m/s` : ''}

[View Ship Details](/ships/${slug})
`;

        const { error } = await supabase
          .from('news')
          .upsert({
            hash,
            title: newsTitle,
            excerpt: newsExcerpt,
            content_md: newsContent,
            category,
            published_at: shipSourceTimestamp,
            source: {
              source: 'starcitizen-api',
              url: `https://api.starcitizen-api.com/v1/live/vehicles/${slug}`,
              ts: new Date().toISOString(),
            },
            source_url: ship.url || `https://robertsspaceindustries.com/pledge/ships/${slug}`,
            image_url: ship.image_url || ship.media?.[0]?.source_url,
          }, {
            onConflict: 'hash'
          });

        if (error) {
          console.error(`Error creating news for ship ${slug}:`, error);
        } else {
          itemsSynced++;
          console.log(`Created ${category} news for: ${ship.name}`);
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