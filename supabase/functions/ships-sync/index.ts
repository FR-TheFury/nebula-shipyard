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
    const url = 'https://starcitizen.tools/api.php?action=query&list=categorymembers&cmtitle=Category:Ships&cmlimit=500&cmnamespace=0&format=json';
    console.log('Fetching ship list from Star Citizen Wiki...');
    
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to fetch ship list: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const titles: string[] = [];
    
    // Keywords to exclude (WIP, components, weapons, etc.)
    const excludeKeywords = [
      'WIP', 'Work in progress', 'Concept',
      'Weapon', 'Gun', 'Missile', 'Torpedo',
      'Component', 'Engine', 'Shield', 'Power Plant',
      'Thruster', 'Cooler', 'Quantum Drive',
      'Module', 'Turret', 'Mount',
      'File:', 'Template:', 'Category:',
      '/Specifications', '/Gallery', '/History',
      'List of', 'Comparison'
    ];
    
    if (data?.query?.categorymembers) {
      for (const member of data.query.categorymembers) {
        const title = member.title;
        
        if (!title) continue;
        
        // Skip if title contains excluded keywords
        const shouldExclude = excludeKeywords.some(keyword => 
          title.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (shouldExclude) {
          console.log(`⊘ Excluded: ${title}`);
          continue;
        }
        
        // Only include pages in main namespace (no subpages)
        if (title.includes('/') || title.includes(':')) {
          console.log(`⊘ Excluded subpage: ${title}`);
          continue;
        }
        
        titles.push(title);
      }
    }
    
    console.log(`Found ${titles.length} valid ships after filtering`);
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
  
  // Helper to clean wiki markup from values
  const cleanValue = (val: string): string => {
    return val
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[link|text]] -> text
      .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[link]] -> link
      .replace(/\{\{[^}]+\}\}/g, '') // remove templates
      .replace(/<[^>]+>/g, '') // remove HTML tags
      .replace(/\n/g, ' ')
      .trim();
  };
  
  // Extract manufacturer - try multiple patterns
  let manufacturerMatch = wikitext.match(/\|\s*manufacturer\s*=\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/i);
  if (!manufacturerMatch) manufacturerMatch = wikitext.match(/\|\s*manufacturer\s*=\s*([^\n|]+)/i);
  if (manufacturerMatch) {
    extracted.manufacturer = cleanValue(manufacturerMatch[1]);
    console.log(`  Manufacturer: ${extracted.manufacturer}`);
  }
  
  // Extract role/focus - multiple field names
  let roleMatch = wikitext.match(/\|\s*(?:focus|role|career)\s*=\s*([^\n|]+)/i);
  if (roleMatch) {
    extracted.role = cleanValue(roleMatch[1]);
    console.log(`  Role: ${extracted.role}`);
  }
  
  // Extract size
  let sizeMatch = wikitext.match(/\|\s*size\s*=\s*([^\n|]+)/i);
  if (sizeMatch) {
    extracted.size = cleanValue(sizeMatch[1]);
    console.log(`  Size: ${extracted.size}`);
  }
  
  // Extract crew with various field names
  const crewMinMatch = wikitext.match(/\|\s*(?:min[\s_-]crew|crew[\s_-]min)\s*=\s*(\d+)/i);
  const crewMaxMatch = wikitext.match(/\|\s*(?:max[\s_-]crew|crew[\s_-]max)\s*=\s*(\d+)/i);
  const crewMatch = wikitext.match(/\|\s*crew\s*=\s*(\d+)(?:\s*-\s*(\d+))?/i);
  
  if (crewMinMatch || crewMaxMatch || crewMatch) {
    extracted.crew = {
      min: crewMinMatch ? parseInt(crewMinMatch[1]) : (crewMatch ? parseInt(crewMatch[1]) : undefined),
      max: crewMaxMatch ? parseInt(crewMaxMatch[1]) : (crewMatch && crewMatch[2] ? parseInt(crewMatch[2]) : undefined)
    };
    console.log(`  Crew: ${extracted.crew.min}-${extracted.crew.max}`);
  }
  
  // Extract cargo
  const cargoMatch = wikitext.match(/\|\s*cargo[\s_-]?(?:capacity)?\s*=\s*([\d.,]+)/i);
  if (cargoMatch) {
    extracted.cargo = parseFloat(cargoMatch[1].replace(/,/g, ''));
    console.log(`  Cargo: ${extracted.cargo}`);
  }
  
  // Extract dimensions
  const lengthMatch = wikitext.match(/\|\s*length\s*=\s*([\d.,]+)/i);
  const beamMatch = wikitext.match(/\|\s*(?:beam|width)\s*=\s*([\d.,]+)/i);
  const heightMatch = wikitext.match(/\|\s*height\s*=\s*([\d.,]+)/i);
  if (lengthMatch || beamMatch || heightMatch) {
    extracted.dimensions = {
      length: lengthMatch ? parseFloat(lengthMatch[1].replace(/,/g, '')) : undefined,
      beam: beamMatch ? parseFloat(beamMatch[1].replace(/,/g, '')) : undefined,
      height: heightMatch ? parseFloat(heightMatch[1].replace(/,/g, '')) : undefined
    };
    console.log(`  Dimensions: ${extracted.dimensions.length}x${extracted.dimensions.beam}x${extracted.dimensions.height}`);
  }
  
  // Extract speeds
  const scmMatch = wikitext.match(/\|\s*(?:scm[\s_-]speed|speed[\s_-]scm)\s*=\s*([\d.,]+)/i);
  const maxMatch = wikitext.match(/\|\s*(?:max[\s_-]speed|afterburner[\s_-]speed|speed[\s_-]max)\s*=\s*([\d.,]+)/i);
  if (scmMatch || maxMatch) {
    extracted.speeds = {
      scm: scmMatch ? parseFloat(scmMatch[1].replace(/,/g, '')) : undefined,
      max: maxMatch ? parseFloat(maxMatch[1].replace(/,/g, '')) : undefined
    };
    console.log(`  Speeds: SCM ${extracted.speeds.scm} / Max ${extracted.speeds.max}`);
  }
  
  // Extract price
  const priceMatch = wikitext.match(/\|\s*(?:price|pledge[\s_-]price|msrp)\s*=\s*\$?\s*([\d,]+)/i);
  if (priceMatch) {
    const price = parseInt(priceMatch[1].replace(/,/g, ''));
    extracted.prices = [{ amount: price, currency: 'USD' }];
    console.log(`  Price: $${price}`);
  }
  
  // Extract production status
  const statusMatch = wikitext.match(/\|\s*(?:production[\s_-]status|status|availability)\s*=\s*([^\n|]+)/i);
  if (statusMatch) {
    extracted.patch = cleanValue(statusMatch[1]);
    console.log(`  Status: ${extracted.patch}`);
  }
  
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
        
        // Skip if this doesn't look like a real ship (no manufacturer = not a ship)
        if (!parsedData.manufacturer && !wikitext.toLowerCase().includes('manufacturer')) {
          console.log(`⊘ Skipped ${title} (not a ship - no manufacturer)`);
          continue;
        }
        
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
