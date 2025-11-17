import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Clearing old FleetYards models cache...');
    
    // Delete old cache
    const { error: deleteError } = await supabaseClient
      .from('fleetyards_models_cache')
      .delete()
      .neq('id', 0);

    if (deleteError) {
      console.error('Error deleting old cache:', deleteError);
      throw deleteError;
    }

    console.log('Fetching all FleetYards models...');

    // Fetch all models from FleetYards API
    let allModels: any[] = [];
    let page = 1;
    const perPage = 250;
    let hasMore = true;

    while (hasMore) {
      console.log(`Fetching page ${page}...`);
      const response = await fetch(
        `https://api.fleetyards.net/v1/models?page=${page}&perPage=${perPage}`
      );

      if (!response.ok) {
        throw new Error(`FleetYards API returned ${response.status}`);
      }

      const models = await response.json();
      
      if (!models || models.length === 0) {
        hasMore = false;
      } else {
        allModels = allModels.concat(models);
        page++;
        
        // FleetYards has around 300-400 ships, so if we get less than perPage, we're done
        if (models.length < perPage) {
          hasMore = false;
        }
      }

      // Safety check to prevent infinite loops
      if (page > 10) {
        console.warn('Reached max page limit, stopping...');
        hasMore = false;
      }
    }

    console.log(`Fetched ${allModels.length} models from FleetYards`);

    // Store in cache with 24 hour expiration
    const { error: insertError } = await supabaseClient
      .from('fleetyards_models_cache')
      .insert({
        models: allModels,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });

    if (insertError) {
      console.error('Error inserting cache:', insertError);
      throw insertError;
    }

    console.log('FleetYards models cache updated successfully');

    return new Response(
      JSON.stringify({
        success: true,
        models_count: allModels.length,
        message: `Successfully cached ${allModels.length} FleetYards models`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error refreshing FleetYards models:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
