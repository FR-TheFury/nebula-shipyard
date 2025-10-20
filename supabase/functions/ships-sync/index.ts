import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STARCITIZEN_API_KEY = Deno.env.get('STARCITIZEN_API_KEY')!;
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

async function fetchStarCitizenAPIVehicles(): Promise<Vehicle[]> {
  try {
    // Try multiple possible endpoint patterns for StarCitizen-API.com
    const possibleUrls = [
      `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/v1/live/vehicles`,
      `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/vehicles`,
      `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/v1/eager/vehicles`,
      `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/cache/vehicles`,
    ];

    let data: any = null;
    let successUrl = '';

    for (const url of possibleUrls) {
      try {
        console.log(`Trying endpoint: ${url.replace(STARCITIZEN_API_KEY, 'API_KEY')}`);
        const res = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!res.ok) {
          console.log(`Endpoint failed with status ${res.status}: ${url.replace(STARCITIZEN_API_KEY, 'API_KEY')}`);
          continue;
        }

        data = await res.json();
        
        if (data && data.success === 1 && data.data) {
          successUrl = url;
          console.log(`Successfully fetched from: ${url.replace(STARCITIZEN_API_KEY, 'API_KEY')}`);
          break;
        }
      } catch (err) {
        console.log(`Error trying ${url.replace(STARCITIZEN_API_KEY, 'API_KEY')}:`, err);
      }
    }

    if (!data || !data.data) {
      throw new Error('All StarCitizen API endpoints failed or returned no data');
    }

    const vehicles = Array.isArray(data.data) ? data.data : (data.data.vehicles || []);
    console.log(`Fetched ${vehicles.length} vehicles from StarCitizen API`);

    return vehicles
      .filter((v: any) => v.name || v.ship_name)
      .map((v: any) => {
        const name = (v.name || v.ship_name || '').toString().trim();
        const slug = v.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Extract manufacturer
        const manufacturer = v.manufacturer?.name || v.manufacturer_name || v.manufacturer || undefined;

        // Extract image URL
        let image_url: string | undefined;
        if (v.store_image?.url) {
          image_url = v.store_image.url;
        } else if (v.media?.store_url) {
          image_url = v.media.store_url;
        } else if (v.images?.store_large) {
          image_url = v.images.store_large;
        } else if (v.thumbnail?.url) {
          image_url = v.thumbnail.url;
        } else if (typeof v.store_image === 'string') {
          image_url = v.store_image;
        }

        // Extract 3D model URL if available
        const model_glb_url = v.holoviewer?.url || v.model_url || undefined;

        // Extract dimensions
        const dimensions = {
          length: v.length || v.size?.length || v.specifications?.dimensions?.length || undefined,
          beam: v.beam || v.width || v.size?.beam || v.specifications?.dimensions?.beam || undefined,
          height: v.height || v.size?.height || v.specifications?.dimensions?.height || undefined,
        };

        // Extract speeds
        const speeds = {
          scm: v.scm_speed || v.speed?.scm || v.specifications?.speed?.scm || undefined,
          max: v.max_speed || v.afterburner_speed || v.speed?.max || v.specifications?.speed?.max || undefined,
        };

        // Extract crew
        const crew = {
          min: v.min_crew || v.crew?.min || v.specifications?.crew?.min || undefined,
          max: v.max_crew || v.crew?.max || v.specifications?.crew?.max || undefined,
        };

        // Extract cargo
        const cargo = v.cargo_capacity || v.cargo || v.scu || v.specifications?.cargo || undefined;

        // Extract role and size
        const role = v.focus || v.role || v.type || v.career || undefined;
        const size = v.size_class || v.size || v.ship_size || v.class || undefined;

        // Extract prices
        let prices: any = undefined;
        if (v.price) {
          prices = [{
            amount: v.price,
            currency: 'USD'
          }];
        } else if (v.pledge_price) {
          prices = [{
            amount: v.pledge_price,
            currency: 'USD'
          }];
        } else if (v.msrp) {
          prices = [{
            amount: v.msrp,
            currency: 'USD'
          }];
        }

        // Extract patch/status
        const patch = v.production_status || v.status || v.availability || undefined;

        return {
          name,
          slug,
          manufacturer,
          role,
          size,
          crew,
          cargo,
          dimensions,
          speeds,
          armament: v.hardpoints || v.weapons || v.armament || undefined,
          prices,
          patch,
          image_url,
          model_glb_url,
          source_url: v.url || `https://robertsspaceindustries.com/pledge/ships/${slug}`,
        } as Vehicle;
      });
  } catch (error) {
    console.error('Error fetching vehicles from StarCitizen API:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let force = false;
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      force = !!body?.force;
    }
  } catch (_) {
    force = false;
  }

  try {
    console.log('Starting ships sync...', { force });
    const vehicles = await fetchStarCitizenAPIVehicles();
    console.log(`Fetched ${vehicles.length} vehicles from StarCitizen API`);
    
    let upserts = 0;
    let errors = 0;

    for (const v of vehicles) {
      try {
        // Create hash excluding volatile fields (images) to detect real data changes
        const toHash = { ...v } as any;
        delete toHash.image_url;
        delete toHash.model_glb_url;
        
        const newHash = await sha256(stableStringify(toHash));
        
        // Check if ship exists and if hash changed
        const { data: existingShip } = await supabase
          .from('ships')
          .select('hash, image_url, model_glb_url')
          .eq('slug', v.slug)
          .maybeSingle();
        
        // Only update if forced, hash changed or images are missing/different
        const hashChanged = force || !existingShip || existingShip.hash !== newHash;
        const hasNewImage = !!v.image_url;
        const hasNewModel = !!v.model_glb_url;
        const imageChanged = force || (hasNewImage && (!existingShip || existingShip.image_url !== v.image_url));
        const modelChanged = force || (hasNewModel && (!existingShip || existingShip.model_glb_url !== v.model_glb_url));
        
        if (hashChanged || imageChanged || modelChanged) {
          const source = {
            source: 'starcitizen-api',
            url: v.source_url,
            ts: new Date().toISOString(),
            changes: {
              data: hashChanged,
              image: imageChanged,
              model: modelChanged
            }
          };

          const payload: any = {
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
            source,
            hash: newHash,
            updated_at: new Date().toISOString()
          };

          // Avoid overwriting existing image/model with null/undefined
          if (hasNewImage) payload.image_url = v.image_url; else if (existingShip?.image_url) payload.image_url = existingShip.image_url;
          if (hasNewModel) payload.model_glb_url = v.model_glb_url; else if (existingShip?.model_glb_url) payload.model_glb_url = existingShip.model_glb_url;

          const { error } = await supabase.from('ships').upsert(payload, { onConflict: 'slug' });

          if (error) {
            console.error(`Error upserting ${v.slug}:`, error);
            errors++;
          } else {
            upserts++;
            if (existingShip) {
              console.log(`Updated ${v.slug} (data: ${hashChanged}, img: ${imageChanged}, model: ${modelChanged})`);
            } else {
              console.log(`Created new ship: ${v.slug}`);
            }
          }
        } else {
          console.log(`Skipped ${v.slug} - no changes detected`);
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
        timestamp: new Date().toISOString(),
        force
      }
    });

    console.log(`Ships sync completed: ${upserts} upserts, ${errors} errors (force=${force})`);

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
