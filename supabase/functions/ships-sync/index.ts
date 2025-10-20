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
    // Fetch with includes to get all related data
    const res = await fetch('https://api.star-citizen.wiki/api/v3/vehicles?limit=1000&include=manufacturer,media');
    const data = await res.json();
    
    console.log(`Fetched ${data.data.length} raw vehicles from API`);
    
    return data.data
      .filter((v: any) => v.name && (v.slug || v.name)) // Filter out invalid entries
      .map((v: any) => {
        // Generate slug from name if missing
        const slug = v.slug || v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        // Extract best quality image from all available media
        let image_url: string | undefined;
        let model_glb_url: string | undefined;
        
        if (v.media && Array.isArray(v.media)) {
          // Look for images first
          for (const mediaItem of v.media) {
            if (mediaItem.images && Array.isArray(mediaItem.images) && mediaItem.images.length > 0) {
              // Prefer images marked as 'store' or highest resolution
              const storeImage = mediaItem.images.find((img: any) => img.type === 'store_large' || img.type === 'store');
              const largeImage = mediaItem.images.find((img: any) => img.width && img.width >= 1920);
              const firstImage = mediaItem.images[0];
              
              image_url = (storeImage?.source_url || largeImage?.source_url || firstImage?.source_url);
              if (image_url) break;
            }
          }
          
          // Look for 3D models
          for (const mediaItem of v.media) {
            if (mediaItem.type === 'model' || mediaItem.format === 'glb' || mediaItem.format === 'gltf') {
              model_glb_url = mediaItem.source_url;
              break;
            }
          }
        }
        
        // Fallback to direct image properties if media is not available
        if (!image_url && v.store_image) {
          image_url = v.store_image;
        }
        
        // Extract dimensions with fallbacks
        const dimensions = {
          length: v.length || v.size_length || null,
          beam: v.beam || v.size_beam || v.width || null,
          height: v.height || v.size_height || null
        };
        
        // Extract speeds with fallbacks
        const speeds = {
          scm: v.scm_speed || v.speed_scm || null,
          max: v.afterburner_speed || v.speed_max || v.max_speed || null
        };
        
        // Extract crew info
        const crew = {
          min: v.crew?.min || v.min_crew || v.crew_min || null,
          max: v.crew?.max || v.max_crew || v.crew_max || null
        };
        
        // Extract cargo
        const cargo = v.cargo_capacity || v.cargo || v.scu || null;
        
        // Extract manufacturer name
        const manufacturer = v.manufacturer?.name || v.manufacturer_name || v.manufacturer || null;
        
        // Extract role/focus
        const role = v.focus || v.role || v.type || null;
        
        // Extract size classification
        const size = v.size || v.ship_size || v.class || null;
        
        return {
          name: v.name.trim(),
          slug,
          manufacturer,
          role,
          size,
          crew,
          cargo,
          dimensions,
          speeds,
          armament: v.hardpoints || v.weapons || null,
          prices: v.prices || v.pledge_price ? [{ amount: v.pledge_price, currency: 'USD' }] : null,
          patch: v.production_status?.release_status || v.status || v.patch || null,
          image_url,
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
        // Create hash excluding volatile fields (images) to detect real data changes
        const toHash = { ...v };
        delete (toHash as any).image_url;
        delete (toHash as any).model_glb_url;
        
        const newHash = await sha256(stableStringify(toHash));
        
        // Check if ship exists and if hash changed
        const { data: existingShip } = await supabase
          .from('ships')
          .select('hash, image_url, model_glb_url')
          .eq('slug', v.slug)
          .maybeSingle();
        
        // Only update if hash changed or images are missing/different
        const hashChanged = !existingShip || existingShip.hash !== newHash;
        const imageChanged = !existingShip || existingShip.image_url !== v.image_url;
        const modelChanged = !existingShip || existingShip.model_glb_url !== v.model_glb_url;
        
        if (hashChanged || imageChanged || modelChanged) {
          const source = {
            source: 'wiki',
            url: v.source_url,
            ts: new Date().toISOString(),
            changes: {
              data: hashChanged,
              image: imageChanged,
              model: modelChanged
            }
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
            hash: newHash,
            updated_at: new Date().toISOString()
          }, { onConflict: 'slug' });

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
