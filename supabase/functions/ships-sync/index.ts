import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Vehicle {
  name: string;
  slug: string;
  manufacturer?: string;
  role?: string;
  size?: string;
  crew?: { min?: number; max?: number };
  cargo?: number;
  dimensions?: { length?: number; beam?: number; height?: number };
  speeds?: { scm?: number; max?: number };
  armament?: unknown;
  prices?: unknown;
  patch?: string;
  image_url?: string;
  model_glb_url?: string;
  source_url: string;
}

function stableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

async function sha256(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchWikiVehicles(): Promise<Vehicle[]> {
  try {
    const res = await fetch('https://api.star-citizen.wiki/api/v3/vehicles?limit=1000');
    const data = await res.json();
    
    return data.data
      .filter((v: any) => v.name && (v.slug || v.name)) // Filter out invalid entries
      .map((v: any) => {
        // Generate slug from name if missing
        const slug = v.slug || v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        // Extract 3D model URL if available
        let model_glb_url: string | undefined;
        if (v.media) {
          for (const mediaItem of v.media) {
            if (mediaItem.type === 'model' || mediaItem.format === 'glb' || mediaItem.format === 'gltf') {
              model_glb_url = mediaItem.source_url;
              break;
            }
          }
        }
        
        return {
          name: v.name,
          slug,
          manufacturer: v.manufacturer?.name,
          role: v.focus || v.role,
          size: v.size,
          crew: { min: v.crew?.min, max: v.crew?.max },
          cargo: v.cargo_capacity,
          dimensions: { length: v.length, beam: v.beam, height: v.height },
          speeds: { scm: v.scm_speed, max: v.afterburner_speed },
          armament: v.hardpoints,
          prices: v.prices,
          patch: v.production_status?.release_status,
          image_url: v.media?.[0]?.images?.[0]?.source_url,
          model_glb_url,
          source_url: `https://starcitizen.tools/${slug}`
        };
      });
  } catch (error) {
    console.error('Error fetching vehicles from Wiki:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting ships sync...');
    const vehicles = await fetchWikiVehicles();
    console.log(`Fetched ${vehicles.length} vehicles from Wiki`);
    
    let upserts = 0;
    let errors = 0;

    for (const v of vehicles) {
      try {
        const toHash = { ...v };
        delete (toHash as any).image_url; // Image URLs are volatile
        
        const hash = await sha256(stableStringify(toHash));
        const source = {
          source: 'wiki',
          url: v.source_url,
          ts: new Date().toISOString()
        };

        const { error } = await supabase.from('ships').upsert({
          slug: v.slug,
          name: v.name,
          manufacturer: v.manufacturer,
          role: v.role,
          size: v.size,
          crew_min: v.crew?.min,
          crew_max: v.crew?.max,
          cargo_scu: v.cargo,
          length_m: v.dimensions?.length,
          beam_m: v.dimensions?.beam,
          height_m: v.dimensions?.height,
          scm_speed: v.speeds?.scm,
          max_speed: v.speeds?.max,
          armament: v.armament,
          prices: v.prices,
          patch: v.patch,
          image_url: v.image_url,
          model_glb_url: v.model_glb_url,
          source,
          hash,
          updated_at: new Date().toISOString()
        }, { onConflict: 'slug' });

        if (error) {
          console.error(`Error upserting ${v.slug}:`, error);
          errors++;
        } else {
          upserts++;
        }
      } catch (err) {
        console.error(`Error processing vehicle ${v.slug}:`, err);
        errors++;
      }
    }

    // Refresh materialized view
    try {
      await supabase.rpc('refresh_active_users_30d');
    } catch (err) {
      console.error('Error refreshing active_users_30d view:', err);
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      action: 'ships_sync',
      target: 'ships',
      meta: {
        total_vehicles: vehicles.length,
        upserts,
        errors,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`Ships sync completed: ${upserts} upserts, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        upserts, 
        errors,
        total: vehicles.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fatal error in ships-sync:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
