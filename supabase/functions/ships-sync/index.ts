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

async function fetchLatestVersion(): Promise<string> {
  try {
    const url = `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/v1/gamedata/list`;
    console.log(`Fetching available versions from gamedata/list`);
    
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.log(`Failed to fetch versions (status ${res.status}), using fallback "live"`);
      return 'live';
    }

    const data = await res.json();
    
    if (data?.success === 1) {
      if (Array.isArray(data.data) && data.data.length > 0) {
        const versions = data.data.filter((v: any) => typeof v === 'string');
        if (versions.length) {
          const latest = versions[versions.length - 1];
          console.log('Latest version found in data.data:', latest);
          return latest;
        }
      }
      if (Array.isArray((data as any).versions) && (data as any).versions.length > 0) {
        const versions = (data as any).versions.filter((v: any) => typeof v === 'string');
        if (versions.length) {
          const latest = versions[versions.length - 1];
          console.log('Latest version found in data.versions:', latest);
          return latest;
        }
      }
    }
    
    console.log('No versions found in response, using fallback "live"');
    return 'live';
  } catch (error) {
    console.error('Error fetching latest version:', error);
    return 'live';
  }
}

async function fetchStarCitizenAPIVehicles(): Promise<Vehicle[]> {
  try {
    // StarCitizen-API.com "From Website" endpoints to try
    const possibleUrls = [
      `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/v1/live/vehicles`,
      `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/v1/cache/vehicles`,
      `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/v1/auto/vehicles`,
      `https://api.starcitizen-api.com/${STARCITIZEN_API_KEY}/v1/eager/vehicles`,
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
          console.log(`Endpoint failed with HTTP status ${res.status}`);
          continue;
        }

        const rawData = await res.json();
        console.log(`Response format:`, JSON.stringify(rawData).substring(0, 300));
        
        // STRICT VALIDATION: Only accept success=1 AND data is truthy
        if (rawData && rawData.success === 1 && rawData.data) {
          data = rawData;
          successUrl = url;
          console.log(`✅ Successfully fetched valid response from StarCitizen-API.com`);
          break;
        } else {
          console.log(`❌ Invalid response: success=${rawData?.success}, data=${!!rawData?.data}, message="${rawData?.message}"`);
        }
      } catch (err) {
        console.log(`❌ Error trying endpoint:`, err);
      }
    }

    if (!data || !data.data) {
      throw new Error('StarCitizen-API.com returned no usable ship data after all endpoints tried');
    }

    // Extract vehicles array from EXPLICIT array structures only
    let vehicles: any[] = [];
    if (Array.isArray(data.data)) {
      vehicles = data.data;
      console.log(`Found ${vehicles.length} vehicles in data.data (array)`);
    } else if (data.data && typeof data.data === 'object') {
      // Try explicit property names only
      if (Array.isArray(data.data.ships)) {
        vehicles = data.data.ships;
        console.log(`Found ${vehicles.length} vehicles in data.data.ships`);
      } else if (Array.isArray(data.data.vehicles)) {
        vehicles = data.data.vehicles;
        console.log(`Found ${vehicles.length} vehicles in data.data.vehicles`);
      } else if (Array.isArray(data.data.items)) {
        vehicles = data.data.items;
        console.log(`Found ${vehicles.length} vehicles in data.data.items`);
      }
    }
    
    if (vehicles.length === 0) {
      throw new Error('No vehicle array found in API response');
    }
    
    console.log(`📦 Fetched ${vehicles.length} raw vehicles from StarCitizen API`);
    if (vehicles.length > 0) {
      console.log(`Example vehicle (first 200 chars):`, JSON.stringify(vehicles[0]).substring(0, 200));
    }

    const mappedVehicles = vehicles
      .filter((v: any) => v && typeof v === 'object')
      .filter((v: any) => {
        const hasName = !!(v.name || v.ship_name || v.Name || v.ClassName);
        if (!hasName) {
          console.log('⚠️ Skipping vehicle without name');
        }
        return hasName;
      })
      .map((v: any) => {
        // Extract name (try multiple possible field names)
        const name = (v.name || v.ship_name || v.Name || v.ClassName || '').toString().trim();
        const slug = v.slug || v.Slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Extract manufacturer (multiple possible structures)
        const manufacturer = v.manufacturer?.name || v.manufacturer?.Name || 
                           v.manufacturer_name || v.manufacturer || 
                           v.Manufacturer?.Name || v.Manufacturer?.name ||
                           v.Manufacturer || undefined;

        // Extract image URL (comprehensive search)
        let image_url: string | undefined;
        if (v.store_image?.url || v.store_image?.Url) {
          image_url = v.store_image.url || v.store_image.Url;
        } else if (v.StoreImage?.Url) {
          image_url = v.StoreImage.Url;
        } else if (v.media?.store_url || v.Media?.StoreUrl) {
          image_url = v.media?.store_url || v.Media?.StoreUrl;
        } else if (v.images?.store_large || v.Images?.StoreLarge) {
          image_url = v.images?.store_large || v.Images?.StoreLarge;
        } else if (v.thumbnail?.url || v.Thumbnail?.Url) {
          image_url = v.thumbnail?.url || v.Thumbnail?.Url;
        } else if (typeof v.store_image === 'string') {
          image_url = v.store_image;
        } else if (typeof v.StoreImage === 'string') {
          image_url = v.StoreImage;
        }

        // Extract 3D model URL
        const model_glb_url = v.holoviewer?.url || v.Holoviewer?.Url || 
                             v.model_url || v.ModelUrl || undefined;

        // Extract dimensions (try both snake_case and PascalCase)
        const dimensions = {
          length: v.length || v.Length || v.size?.length || v.Size?.Length || 
                 v.specifications?.dimensions?.length || v.Specifications?.Dimensions?.Length || undefined,
          beam: v.beam || v.Beam || v.width || v.Width || v.size?.beam || v.Size?.Beam || 
               v.specifications?.dimensions?.beam || v.Specifications?.Dimensions?.Beam || undefined,
          height: v.height || v.Height || v.size?.height || v.Size?.Height || 
                 v.specifications?.dimensions?.height || v.Specifications?.Dimensions?.Height || undefined,
        };

        // Extract speeds
        const speeds = {
          scm: v.scm_speed || v.ScmSpeed || v.speed?.scm || v.Speed?.Scm || 
              v.specifications?.speed?.scm || v.Specifications?.Speed?.Scm || undefined,
          max: v.max_speed || v.MaxSpeed || v.afterburner_speed || v.AfterburnerSpeed || 
              v.speed?.max || v.Speed?.Max || 
              v.specifications?.speed?.max || v.Specifications?.Speed?.Max || undefined,
        };

        // Extract crew
        const crew = {
          min: v.min_crew || v.MinCrew || v.crew?.min || v.Crew?.Min || 
              v.specifications?.crew?.min || v.Specifications?.Crew?.Min || undefined,
          max: v.max_crew || v.MaxCrew || v.crew?.max || v.Crew?.Max || 
              v.specifications?.crew?.max || v.Specifications?.Crew?.Max || undefined,
        };

        // Extract cargo
        const cargo = v.cargo_capacity || v.CargoCapacity || v.cargo || v.Cargo || 
                     v.scu || v.SCU || v.specifications?.cargo || v.Specifications?.Cargo || undefined;

        // Extract role and size
        const role = v.focus || v.Focus || v.role || v.Role || v.type || v.Type || 
                    v.career || v.Career || undefined;
        const size = v.size_class || v.SizeClass || v.size || v.Size || 
                    v.ship_size || v.ShipSize || v.class || v.Class || undefined;

        // Extract prices (comprehensive)
        let prices: any = undefined;
        const priceValue = v.price || v.Price || v.pledge_price || v.PledgePrice || 
                          v.msrp || v.MSRP || v.Msrp;
        if (priceValue) {
          prices = [{
            amount: priceValue,
            currency: 'USD'
          }];
        }

        // Extract patch/status
        const patch = v.production_status || v.ProductionStatus || 
                     v.status || v.Status || 
                     v.availability || v.Availability || undefined;

        const vehicle = {
          name,
          slug,
          manufacturer,
          role,
          size,
          crew,
          cargo,
          dimensions,
          speeds,
          armament: v.hardpoints || v.Hardpoints || v.weapons || v.Weapons || 
                   v.armament || v.Armament || undefined,
          prices,
          patch,
          image_url,
          model_glb_url,
          source_url: v.url || v.Url || `https://robertsspaceindustries.com/pledge/ships/${slug}`,
        } as Vehicle;

        console.log(`✨ Mapped vehicle: ${name} (${manufacturer || 'Unknown'})`);
        return vehicle;
      });
    
    console.log(`✅ Successfully mapped ${mappedVehicles.length} vehicles`);
    
    if (mappedVehicles.length === 0) {
      throw new Error('No valid vehicles after mapping (all filtered out)');
    }
    
    return mappedVehicles;
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
