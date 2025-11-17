import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { fleetyards_slug } = await req.json();

    if (!fleetyards_slug) {
      return new Response(
        JSON.stringify({ error: 'fleetyards_slug is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Testing FleetYards slug: ${fleetyards_slug}`);

    // Fetch from FleetYards API
    const response = await fetch(`https://api.fleetyards.net/v1/models/${fleetyards_slug}`);
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          available: false, 
          error: `FleetYards API returned ${response.status}`,
          data: null,
          quality_score: null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Calculate quality score
    const hasHardpoints = data.hardpoints && data.hardpoints.length > 0;
    const hasComponents = data.components && data.components.length > 0;
    const hasImages = !!(data.storeImage || data.fleetchartImage);
    const hasDescription = !!data.description;
    const hasSpecs = !!(data.length || data.beam || data.height);

    const qualityScore = {
      has_hardpoints: hasHardpoints,
      has_components: hasComponents,
      has_images: hasImages,
      has_description: hasDescription,
      has_specs: hasSpecs,
      completeness: [hasHardpoints, hasComponents, hasImages, hasDescription, hasSpecs]
        .filter(Boolean).length / 5 * 100
    };

    console.log(`FleetYards data quality: ${qualityScore.completeness}%`);

    return new Response(
      JSON.stringify({
        available: true,
        data,
        quality_score: qualityScore,
        slug_tested: fleetyards_slug
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing slug mapping:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
