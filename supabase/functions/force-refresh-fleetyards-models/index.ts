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

    console.log('Fetching all FleetYards models with pagination...');

    // FleetYards API uses pagination with perPage parameter (max ~150)
    let allModels: any[] = [];
    let page = 1;
    const perPage = 100; // Safe value under the max limit
    let hasMore = true;

    while (hasMore) {
      console.log(`Fetching page ${page} (${perPage} items per page)...`);
      const response = await fetch(
        `https://api.fleetyards.net/v1/models?page=${page}&perPage=${perPage}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`FleetYards API error: ${response.status} - ${errorText}`);
        throw new Error(`FleetYards API returned ${response.status}: ${errorText}`);
      }

      const models = await response.json();
      
      // Check if response is an error object
      if (models && typeof models === 'object' && 'code' in models) {
        console.error('FleetYards API returned error:', models);
        throw new Error(`FleetYards API error: ${models.message || models.code}`);
      }

      if (!Array.isArray(models)) {
        console.error('FleetYards API did not return an array:', models);
        throw new Error('FleetYards API response is not an array');
      }

      console.log(`Page ${page}: received ${models.length} models`);
      
      if (models.length === 0) {
        hasMore = false;
      } else {
        allModels = allModels.concat(models);
        
        // If we got less than perPage items, we've reached the end
        if (models.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      }

      // Safety check to prevent infinite loops (FleetYards has ~300-400 ships)
      if (page > 20) {
        console.warn('Reached max page limit (20 pages), stopping...');
        hasMore = false;
      }
    }

    console.log(`✓ Fetched total of ${allModels.length} models from FleetYards across ${page} pages`);

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
