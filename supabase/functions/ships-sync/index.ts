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

async function fetchShipTitlesFromWiki(): Promise<string[]> {
  try {
    // Fetch all ship pages from Star Citizen Wiki
    const url = 'https://starcitizen.tools/api.php?action=query&list=categorymembers&cmtitle=Category:Ships&cmlimit=500&format=json';
    console.log('Fetching ship list from Star Citizen Wiki...');
    
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to fetch ship list: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const titles: string[] = [];
    
    if (data?.query?.categorymembers) {
      for (const member of data.query.categorymembers) {
        if (member.title) {
          titles.push(member.title);
        }
      }
    }
    
    console.log(`Found ${titles.length} ships in wiki`);
    return titles;
  } catch (error) {
    console.error('Error fetching ship titles from wiki:', error);
    return [];
  }
}

async function fetchShipDataFromWiki(title: string): Promise<any> {
  try {
    // Fetch ship data using MediaWiki API with Semantic MediaWiki properties
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'revisions|pageimages|info',
      rvprop: 'content',
      rvslots: 'main',
      piprop: 'thumbnail|original',
      pithumbsize: '800',
      inprop: 'url',
      format: 'json'
    });
    
    const url = `https://starcitizen.tools/api.php?${params}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      console.error(`Failed to fetch data for ${title}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error(`Error fetching data for ${title}:`, error);
    return null;
  }
}

function parseWikitext(wikitext: string): any {
  // Extract infobox data from wikitext
  const extracted: any = {};
  
  // Extract manufacturer
  const manufacturerMatch = wikitext.match(/\|manufacturer\s*=\s*([^\n|]+)/i);
  if (manufacturerMatch) extracted.manufacturer = manufacturerMatch[1].trim();
  
  // Extract role/focus
  const roleMatch = wikitext.match(/\|focus\s*=\s*([^\n|]+)/i) || wikitext.match(/\|role\s*=\s*([^\n|]+)/i);
  if (roleMatch) extracted.role = roleMatch[1].trim();
  
  // Extract size
  const sizeMatch = wikitext.match(/\|size\s*=\s*([^\n|]+)/i);
  if (sizeMatch) extracted.size = sizeMatch[1].trim();
  
  // Extract crew
  const crewMinMatch = wikitext.match(/\|min[\s_]crew\s*=\s*(\d+)/i);
  const crewMaxMatch = wikitext.match(/\|max[\s_]crew\s*=\s*(\d+)/i);
  if (crewMinMatch || crewMaxMatch) {
    extracted.crew = {
      min: crewMinMatch ? parseInt(crewMinMatch[1]) : undefined,
      max: crewMaxMatch ? parseInt(crewMaxMatch[1]) : undefined
    };
  }
  
  // Extract cargo
  const cargoMatch = wikitext.match(/\|cargo[\s_]capacity\s*=\s*([\d.]+)/i);
  if (cargoMatch) extracted.cargo = parseFloat(cargoMatch[1]);
  
  // Extract dimensions
  const lengthMatch = wikitext.match(/\|length\s*=\s*([\d.]+)/i);
  const beamMatch = wikitext.match(/\|beam\s*=\s*([\d.]+)/i) || wikitext.match(/\|width\s*=\s*([\d.]+)/i);
  const heightMatch = wikitext.match(/\|height\s*=\s*([\d.]+)/i);
  if (lengthMatch || beamMatch || heightMatch) {
    extracted.dimensions = {
      length: lengthMatch ? parseFloat(lengthMatch[1]) : undefined,
      beam: beamMatch ? parseFloat(beamMatch[1]) : undefined,
      height: heightMatch ? parseFloat(heightMatch[1]) : undefined
    };
  }
  
  // Extract speeds
  const scmMatch = wikitext.match(/\|scm[\s_]speed\s*=\s*([\d.]+)/i);
  const maxMatch = wikitext.match(/\|max[\s_]speed\s*=\s*([\d.]+)/i) || wikitext.match(/\|afterburner[\s_]speed\s*=\s*([\d.]+)/i);
  if (scmMatch || maxMatch) {
    extracted.speeds = {
      scm: scmMatch ? parseFloat(scmMatch[1]) : undefined,
      max: maxMatch ? parseFloat(maxMatch[1]) : undefined
    };
  }
  
  // Extract price
  const priceMatch = wikitext.match(/\|price\s*=\s*([\d,]+)/i) || wikitext.match(/\|pledge[\s_]price\s*=\s*([\d,]+)/i);
  if (priceMatch) {
    const price = parseInt(priceMatch[1].replace(/,/g, ''));
    extracted.prices = [{ amount: price, currency: 'USD' }];
  }
  
  // Extract production status
  const statusMatch = wikitext.match(/\|production[\s_]status\s*=\s*([^\n|]+)/i) || wikitext.match(/\|status\s*=\s*([^\n|]+)/i);
  if (statusMatch) extracted.patch = statusMatch[1].trim();
  
  return extracted;
}

async function fetchStarCitizenAPIVehicles(): Promise<Vehicle[]> {
  try {
    console.log('🚀 Starting ship sync from Star Citizen Wiki...');
    
    // Step 1: Get all ship titles from Wiki
    const shipTitles = await fetchShipTitlesFromWiki();
    
    if (shipTitles.length === 0) {
      throw new Error('No ships found in Star Citizen Wiki');
    }
    
    console.log(`Processing ${shipTitles.length} ships...`);
    
    const vehicles: Vehicle[] = [];
    let processed = 0;
    
    // Step 2: Fetch detailed data for each ship (in batches to avoid rate limiting)
    for (const title of shipTitles) {
      try {
        const wikiData = await fetchShipDataFromWiki(title);
        
        if (!wikiData?.query?.pages) {
          console.log(`⚠️ No data returned for ${title}`);
          continue;
        }
        
        const page = Object.values(wikiData.query.pages)[0] as any;
        
        if (!page || page.missing) {
          console.log(`⚠️ Page missing: ${title}`);
          continue;
        }
        
        // Extract wikitext content
        const wikitext = page.revisions?.[0]?.slots?.main?.['*'] || '';
        
        // Parse wikitext to extract ship data
        const parsedData = parseWikitext(wikitext);
        
        // Generate slug from title
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        // Get image URL
        let image_url: string | undefined;
        if (page.thumbnail?.source) {
          image_url = page.thumbnail.source;
        } else if (page.original?.source) {
          image_url = page.original.source;
        }
        
        const vehicle: Vehicle = {
          name: title,
          slug,
          manufacturer: parsedData.manufacturer,
          role: parsedData.role,
          size: parsedData.size,
          crew: parsedData.crew,
          cargo: parsedData.cargo,
          dimensions: parsedData.dimensions,
          speeds: parsedData.speeds,
          prices: parsedData.prices,
          patch: parsedData.patch,
          image_url,
          model_glb_url: undefined,
          source_url: page.fullurl || `https://starcitizen.tools/${encodeURIComponent(title.replace(/ /g, '_'))}`,
          armament: undefined
        };
        
        vehicles.push(vehicle);
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`Processed ${processed}/${shipTitles.length} ships...`);
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        console.error(`Error processing ${title}:`, err);
      }
    }
    
    console.log(`✅ Successfully processed ${vehicles.length} ships from Wiki`);
    return vehicles;
  } catch (error) {
    console.error('Error fetching vehicles from Star Citizen Wiki:', error);
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
