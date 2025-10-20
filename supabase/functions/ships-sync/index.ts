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
    // JSON:API: attributes + relationships with resources in `included`
    const url = 'https://api.star-citizen.wiki/api/v3/vehicles?limit=1000&include=manufacturer,media';
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
    const data = await res.json();

    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    const included: any[] = Array.isArray(data?.included) ? data.included : [];

    // Build included lookup map
    const incByKey = new Map<string, any>();
    for (const inc of included) {
      const key = `${inc?.type}:${inc?.id}`;
      if (key) incByKey.set(key, inc);
    }

    const getInc = (type?: string, id?: string | number) => (type && id) ? incByKey.get(`${type}:${id}`) : undefined;
    const attr = (obj: any, key: string) => obj?.[key] ?? obj?.attributes?.[key];

    console.log(`Fetched ${list.length} raw vehicles from API (included: ${included.length})`);

    return list
      .filter((v: any) => (attr(v, 'name')) && (attr(v, 'slug') || attr(v, 'name')))
      .map((v: any) => {
        const a = v.attributes || {};
        const r = v.relationships || {};

        const name = (a.name || v.name || '').toString().trim();
        const slug = (a.slug || v.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));

        // Manufacturer from included
        let manufacturer: string | undefined;
        const manuRef = r?.manufacturer?.data || r?.manufacturer; // JSON:API resource identifier
        if (manuRef?.type && manuRef?.id) {
          const manuInc = getInc(manuRef.type, manuRef.id);
          manufacturer = attr(manuInc, 'name') || attr(manuInc, 'manufacturer_name') || attr(manuInc, 'short_name') || undefined;
        } else {
          manufacturer = a.manufacturer_name || a.manufacturer || undefined;
        }

        // Resolve media from included
        const mediaRefs: any[] = Array.isArray(r?.media?.data) ? r.media.data : [];
        const mediaItems: any[] = mediaRefs
          .map(ref => getInc(ref?.type, ref?.id))
          .filter(Boolean);

        const pickUrl = (obj: any): string | undefined => {
          if (!obj) return undefined;
          // common places
          return obj?.source_url || obj?.image_url || obj?.url || obj?.href || obj?.link || obj?.original_url ||
                 obj?.attributes?.source_url || obj?.attributes?.image_url || obj?.attributes?.url || obj?.attributes?.href || obj?.attributes?.original_url;
        };

        // Image URL
        let image_url: string | undefined;
        for (const media of mediaItems) {
          const imgs = attr(media, 'images');
          if (Array.isArray(imgs) && imgs.length > 0) {
            const storeImage = imgs.find((img: any) => img.type === 'store_large' || img.type === 'store');
            const largeImage = imgs.find((img: any) => (img.width && img.width >= 1920) || (img.size && img.size === 'large'));
            const firstImage = imgs[0];
            image_url = pickUrl(storeImage) || pickUrl(largeImage) || pickUrl(firstImage);
            if (image_url) break;
          }
          // try direct
          const direct = pickUrl(media) || pickUrl(attr(media, 'image'));
          if (!image_url && direct) {
            image_url = direct;
            break;
          }
        }
        if (!image_url) image_url = a.store_image || attr(v, 'store_image') || undefined;

        // 3D model URL
        let model_glb_url: string | undefined;
        for (const media of mediaItems) {
          const candidate = pickUrl(media) || pickUrl(attr(media, 'file'));
          const format = attr(media, 'format') || attr(media, 'mimetype') || '';
          const isModel = /\.(glb|gltf)$/i.test(candidate || '') ||
                          (typeof format === 'string' && /(glb|gltf)/i.test(format)) ||
                          attr(media, 'type') === 'model';
          if (isModel && candidate) {
            model_glb_url = candidate;
            break;
          }
        }

        // Dimensions & specs
        const dimensions = {
          length: a.length ?? a.size_length ?? undefined,
          beam: a.beam ?? a.size_beam ?? a.width ?? undefined,
          height: a.height ?? a.size_height ?? undefined,
        };

        const speeds = {
          scm: a.scm_speed ?? a.speed_scm ?? undefined,
          max: a.afterburner_speed ?? a.speed_max ?? a.max_speed ?? undefined,
        };

        const crew = {
          min: a.min_crew ?? a.crew_min ?? a.crew?.min ?? undefined,
          max: a.max_crew ?? a.crew_max ?? a.crew?.max ?? undefined,
        };

        const cargo = a.cargo_capacity ?? a.cargo ?? a.scu ?? undefined;
        const role = a.focus ?? a.role ?? a.type ?? undefined;
        const size = a.size ?? a.ship_size ?? a.class ?? undefined;

        const prices = a.prices ?? (a.pledge_price ? [{ amount: a.pledge_price, currency: 'USD' }] : undefined);
        const patch = a.production_status?.release_status ?? a.status ?? a.patch ?? undefined;

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
          armament: a.hardpoints || a.weapons || undefined,
          prices,
          patch,
          image_url,
          model_glb_url,
          source_url: `https://starcitizen.tools/${slug}`,
        } as Vehicle;
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
        const hasNewImage = !!v.image_url;
        const hasNewModel = !!v.model_glb_url;
        const imageChanged = hasNewImage && (!existingShip || existingShip.image_url !== v.image_url);
        const modelChanged = hasNewModel && (!existingShip || existingShip.model_glb_url !== v.model_glb_url);
        
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
