import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      throw new Error('Must be admin');
    }

    const { ship_slug, preferred_source, reason, clear_cache } = await req.json();

    if (!ship_slug) {
      throw new Error('ship_slug is required');
    }

    // Clear FleetYards cache if requested
    if (clear_cache) {
      await supabase
        .from('fleetyards_cache')
        .delete()
        .eq('ship_slug', ship_slug.toLowerCase());
      
      console.log(`Cleared cache for ${ship_slug}`);
    }

    if (preferred_source) {
      // Get ship data
      const { data: ship } = await supabase
        .from('ships')
        .select('raw_wiki_data, raw_fleetyards_data, raw_starcitizen_api_data')
        .eq('slug', ship_slug)
        .single();

      if (!ship) {
        throw new Error('Ship not found');
      }

      let armament, systems;

      // Apply the chosen source
      if (preferred_source === 'wiki' && ship.raw_wiki_data) {
        armament = (ship.raw_wiki_data as any).armament;
        systems = (ship.raw_wiki_data as any).systems;
      } else if (preferred_source === 'fleetyards' && ship.raw_fleetyards_data) {
        armament = (ship.raw_fleetyards_data as any).armament;
        systems = (ship.raw_fleetyards_data as any).systems;
      } else if (preferred_source === 'auto') {
        // Re-apply auto-merge logic
        const wikiData = ship.raw_wiki_data as any;
        const fleetYardsData = ship.raw_fleetyards_data as any;
        
        const wikiHasArmament = wikiData?.armament && Object.values(wikiData.armament).some((arr: any) => arr?.length > 0);
        const wikiHasSystems = wikiData?.systems && Object.values(wikiData.systems).some((group: any) => 
          Object.values(group || {}).some((arr: any) => arr?.length > 0)
        );
        
        armament = (!wikiHasArmament && fleetYardsData?.armament) ? fleetYardsData.armament : wikiData?.armament;
        systems = (!wikiHasSystems && fleetYardsData?.systems) ? fleetYardsData.systems : wikiData?.systems;
      } else {
        throw new Error('Invalid source or no data available');
      }

      // Update ship with chosen data
      await supabase
        .from('ships')
        .update({
          armament,
          systems,
          updated_at: new Date().toISOString()
        })
        .eq('slug', ship_slug);

      // Store preference
      await supabase
        .from('ship_data_preferences')
        .upsert({
          ship_slug,
          preferred_source,
          set_by: user.id,
          set_at: new Date().toISOString(),
          reason: reason || null
        });

      console.log(`Updated ${ship_slug} with ${preferred_source} data`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
