import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ CONFIGURATION ============
const BATCH_SIZE = 5; // Process 5 ships in parallel
const ENRICHED_CACHE_DAYS = 7; // Skip enriched data if less than 7 days old
const ENDPOINT_TIMEOUT_MS = 10000; // 10s per endpoint
const MAX_DURATION_MS = 50 * 60 * 1000; // 50 min max
const MAX_CONSECUTIVE_ERRORS = 10;
const FUNCTION_NAME = 'ships-sync';

// Normalize ship type/role (first letter uppercase)
function normalizeShipType(type: string | undefined | null): string | undefined {
  if (!type) return undefined;
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

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
  systems?: unknown;
  prices?: unknown;
  patch?: string;
  production_status?: string;
  image_url?: string;
  model_glb_url?: string;
  source_url: string;
  raw_wiki_data?: unknown;
  raw_fleetyards_data?: unknown;
  fleetyards_slug_used?: string;
  fleetyards_images?: unknown[];
  fleetyards_videos?: unknown[];
  fleetyards_loaners?: unknown[];
  fleetyards_variants?: unknown[];
  fleetyards_modules?: unknown[];
  fleetyards_snub_crafts?: unknown[];
  fleetyards_full_data?: unknown;
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

// Fetch with timeout wrapper
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = ENDPOINT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// Fetch all FleetYards slugs (optimized)
async function fetchAllFleetYardsSlugs(): Promise<string[]> {
  try {
    const { data: cacheData } = await supabase
      .from('fleetyards_models_cache')
      .select('models, expires_at')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (cacheData && new Date(cacheData.expires_at) > new Date()) {
      console.log('✓ Using cached FleetYards slugs');
      return (cacheData.models as any[]).map(m => m.slug);
    }
    
    console.log('Fetching FleetYards slugs...');
    const response = await fetchWithTimeout('https://api.fleetyards.net/v1/models/slugs', {
      headers: { 'Accept': 'application/json' }
    }, 30000);
    
    if (!response.ok) return [];
    
    const slugs = await response.json();
    if (!Array.isArray(slugs)) return [];
    
    // Cache in background
    supabase.from('fleetyards_models_cache').upsert({
      id: 1,
      models: slugs.map(s => ({ slug: s })),
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).then(() => {});
    
    console.log(`✓ Fetched ${slugs.length} FleetYards slugs`);
    return slugs;
  } catch (error) {
    console.error('Error fetching FleetYards slugs:', error);
    return [];
  }
}

// Find best FleetYards slug for a title
function findBestFleetYardsSlug(wikiTitle: string, fleetYardsSlugs: string[]): string | null {
  const baseSlug = wikiTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  
  // Exact match
  if (fleetYardsSlugs.includes(baseSlug)) return baseSlug;
  
  // Simplified match (remove variants)
  const variantKeywords = ['executive', 'touring', 'explorer', 'military', 'commercial', 'civilian', 'edition', 'variant'];
  let simplifiedName = wikiTitle.toLowerCase();
  for (const keyword of variantKeywords) {
    simplifiedName = simplifiedName.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), '').trim();
  }
  const simplifiedSlug = simplifiedName.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  
  if (fleetYardsSlugs.includes(simplifiedSlug)) return simplifiedSlug;
  
  // Find variants
  const variants = fleetYardsSlugs.filter(s => s.startsWith(simplifiedSlug));
  if (variants.length > 0) return variants[0];
  
  return null;
}

// Fetch ship data from FleetYards (with cache check)
async function fetchFleetYardsShipData(
  slug: string, 
  skipEnrichedIfRecent: boolean = true
): Promise<{
  basic: any;
  images: any[];
  videos: any[];
  loaners: any[];
  variants: any[];
  modules: any[];
  snubCrafts: any[];
  fromCache: boolean;
} | null> {
  try {
    // Check if we have recent enriched data
    if (skipEnrichedIfRecent) {
      const { data: existingShip } = await supabase
        .from('ships')
        .select('fleetyards_full_data, fleetyards_images, updated_at')
        .eq('fleetyards_slug_used', slug)
        .maybeSingle();
      
      if (existingShip?.fleetyards_full_data) {
        const updatedAt = new Date(existingShip.updated_at);
        const cacheExpiry = new Date(Date.now() - ENRICHED_CACHE_DAYS * 24 * 60 * 60 * 1000);
        
        if (updatedAt > cacheExpiry) {
          console.log(`  ⏩ Skip enriched fetch for ${slug} - cached ${Math.round((Date.now() - updatedAt.getTime()) / (24*60*60*1000))}d ago`);
          return {
            basic: existingShip.fleetyards_full_data,
            images: (existingShip as any).fleetyards_images || [],
            videos: (existingShip as any).fleetyards_videos || [],
            loaners: (existingShip as any).fleetyards_loaners || [],
            variants: (existingShip as any).fleetyards_variants || [],
            modules: (existingShip as any).fleetyards_modules || [],
            snubCrafts: (existingShip as any).fleetyards_snub_crafts || [],
            fromCache: true
          };
        }
      }
    }
    
    // Fetch basic ship data
    const basicResponse = await fetchWithTimeout(`https://api.fleetyards.net/v1/models/${slug}`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!basicResponse.ok) {
      console.log(`  ❌ FleetYards: ${slug} not found (${basicResponse.status})`);
      return null;
    }
    
    const basic = await basicResponse.json();
    
    // Fetch all enriched endpoints in parallel with aggressive timeouts
    const endpoints = [
      { key: 'images', url: `https://api.fleetyards.net/v1/models/${slug}/images` },
      { key: 'videos', url: `https://api.fleetyards.net/v1/models/${slug}/videos` },
      { key: 'loaners', url: `https://api.fleetyards.net/v1/models/${slug}/loaners` },
      { key: 'variants', url: `https://api.fleetyards.net/v1/models/${slug}/variants` },
      { key: 'modules', url: `https://api.fleetyards.net/v1/models/${slug}/modules` },
      { key: 'snubCrafts', url: `https://api.fleetyards.net/v1/models/${slug}/snub-crafts` }
    ];
    
    const results: any = { images: [], videos: [], loaners: [], variants: [], modules: [], snubCrafts: [] };
    
    await Promise.allSettled(endpoints.map(async ({ key, url }) => {
      try {
        const response = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } });
        if (response.ok) {
          results[key] = await response.json();
        }
      } catch (e) {
        // Ignore timeout errors
      }
    }));
    
    return { basic, ...results, fromCache: false };
  } catch (error) {
    console.error(`Error fetching FleetYards data for ${slug}:`, error);
    return null;
  }
}

// Fetch ship titles from Wiki
async function fetchShipTitlesFromWiki(): Promise<string[]> {
  try {
    const url = 'https://starcitizen.tools/api.php?action=query&list=categorymembers&cmtitle=Category:Ships&cmlimit=500&cmnamespace=0&format=json';
    const res = await fetchWithTimeout(url, {}, 30000);
    
    if (!res.ok) {
      // Fallback to existing mappings
      const { data: mappings } = await supabase.from('ship_slug_mappings').select('wiki_title');
      return mappings?.map(m => m.wiki_title) || [];
    }
    
    const data = await res.json();
    const titles: string[] = [];
    
    const excludeKeywords = [
      'WIP', 'Concept', 'Weapon', 'Gun', 'Missile', 'Torpedo',
      'Component', 'Engine', 'Shield', 'Power Plant', 'Thruster',
      'Module', 'Turret', 'File:', 'Template:', 'Category:',
      '/Specifications', '/Gallery', 'List of', 'Comparison'
    ];
    
    if (data?.query?.categorymembers) {
      for (const member of data.query.categorymembers) {
        const title = member.title;
        if (!title || title.includes('/') || title.includes(':')) continue;
        if (excludeKeywords.some(k => title.toLowerCase().includes(k.toLowerCase()))) continue;
        titles.push(title);
      }
    }
    
    if (titles.length === 0) {
      const { data: mappings } = await supabase.from('ship_slug_mappings').select('wiki_title');
      return mappings?.map(m => m.wiki_title) || [];
    }
    
    return titles;
  } catch (error) {
    console.error('Error fetching ship titles:', error);
    const { data: mappings } = await supabase.from('ship_slug_mappings').select('wiki_title');
    return mappings?.map(m => m.wiki_title) || [];
  }
}

// Fetch basic Wiki data for a ship
async function fetchWikiShipData(title: string): Promise<any> {
  try {
    const params = new URLSearchParams({
      action: 'query', titles: title, prop: 'revisions|pageimages',
      rvprop: 'content', rvslots: 'main', piprop: 'original', format: 'json'
    });
    
    const res = await fetchWithTimeout(`https://starcitizen.tools/api.php?${params}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    return null;
  }
}

// Parse wikitext to extract ship data
function parseWikitext(wikitext: string): any {
  const cleanValue = (val: string | undefined): string => {
    if (!val) return '';
    return val.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, '$2$1')
      .replace(/\{\{[^}]+\}\}/g, '')
      .replace(/<!--.*?-->/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  };
  
  const extracted: any = {
    manufacturer: null, role: null, size: null,
    crew: { min: null, max: null }, cargo: null,
    dimensions: { length: null, beam: null, height: null },
    speeds: { scm: null, max: null },
    prices: [], production_status: null, patch: null,
    armament: { weapons: [], turrets: [], missiles: [], utility: [], countermeasures: [] },
    systems: {
      avionics: { radar: [], computer: [], scanner: [] },
      propulsion: { quantum_drives: [], fuel_tanks: [], fuel_intakes: [] },
      thrusters: { main: [], maneuvering: [], retro: [] },
      power: { power_plants: [], coolers: [], shield_generators: [] }
    }
  };
  
  // Extract basic info
  const manufacturerMatch = wikitext.match(/\|\s*manufacturer\s*=\s*\[\[([^\]|]+)/i);
  if (manufacturerMatch) extracted.manufacturer = cleanValue(manufacturerMatch[1]);
  
  const roleMatch = wikitext.match(/\|\s*(?:focus|role)\s*=\s*([^\n|{]+)/i);
  if (roleMatch) extracted.role = cleanValue(roleMatch[1]);
  
  const sizeMatch = wikitext.match(/\|\s*size\s*=\s*([^\n|{]+)/i);
  if (sizeMatch) extracted.size = cleanValue(sizeMatch[1]);
  
  // Crew
  const crewMinMatch = wikitext.match(/\|\s*crew[\s_-]?min\s*=\s*(\d+)/i);
  const crewMaxMatch = wikitext.match(/\|\s*crew[\s_-]?max\s*=\s*(\d+)/i);
  if (crewMinMatch) extracted.crew.min = parseInt(crewMinMatch[1]);
  if (crewMaxMatch) extracted.crew.max = parseInt(crewMaxMatch[1]);
  
  // Cargo
  const cargoMatch = wikitext.match(/\|\s*(?:cargo|scu)\s*=\s*(\d+)/i);
  if (cargoMatch) extracted.cargo = parseInt(cargoMatch[1]);
  
  // Dimensions
  const lengthMatch = wikitext.match(/\|\s*length\s*=\s*([\d.]+)/i);
  const beamMatch = wikitext.match(/\|\s*(?:beam|width)\s*=\s*([\d.]+)/i);
  const heightMatch = wikitext.match(/\|\s*height\s*=\s*([\d.]+)/i);
  if (lengthMatch) extracted.dimensions.length = parseFloat(lengthMatch[1]);
  if (beamMatch) extracted.dimensions.beam = parseFloat(beamMatch[1]);
  if (heightMatch) extracted.dimensions.height = parseFloat(heightMatch[1]);
  
  // Speeds
  const scmMatch = wikitext.match(/\|\s*scm[\s_-]?speed\s*=\s*([\d.]+)/i);
  const maxMatch = wikitext.match(/\|\s*max[\s_-]?speed\s*=\s*([\d.]+)/i);
  if (scmMatch) extracted.speeds.scm = parseFloat(scmMatch[1]);
  if (maxMatch) extracted.speeds.max = parseFloat(maxMatch[1]);
  
  // Production status
  const statusMatch = wikitext.match(/\|\s*(?:production[\s_-]?status|status)\s*=\s*([^\n|{]+)/i);
  if (statusMatch) extracted.production_status = cleanValue(statusMatch[1]);
  
  // Price
  const priceMatch = wikitext.match(/\|\s*(?:price|pledge[\s_-]?price)\s*=\s*\$?\s*([\d,]+)/i);
  if (priceMatch) {
    const price = parseInt(priceMatch[1].replace(/,/g, ''));
    if (!isNaN(price) && price > 0) extracted.prices = [{ amount: price, currency: 'USD' }];
  }
  
  return extracted;
}

// Map FleetYards hardpoints to our structure
function mapFleetYardsHardpoints(hardpoints: any[]): { armament: any; systems: any } {
  const armament = { weapons: [], turrets: [], missiles: [], utility: [], countermeasures: [] } as any;
  const systems = {
    avionics: { radar: [], computer: [], scanner: [] },
    propulsion: { quantum_drives: [], fuel_tanks: [], fuel_intakes: [] },
    thrusters: { main: [], maneuvering: [], retro: [] },
    power: { power_plants: [], coolers: [], shield_generators: [] }
  } as any;
  
  if (!Array.isArray(hardpoints)) return { armament, systems };
  
  const deduplicate = (items: string[]) => {
    const counts: Record<string, number> = {};
    items.forEach(item => { counts[item] = (counts[item] || 0) + 1; });
    return Object.entries(counts).map(([name, count]) => count > 1 ? `${name} (x${count})` : name);
  };
  
  const temp = { weapons: [], turrets: [], missiles: [], countermeasures: [], power_plants: [], coolers: [], shield_generators: [], quantum_drives: [], radar: [], main: [], maneuvering: [] } as any;
  
  for (const hp of hardpoints) {
    const name = hp.component?.name || hp.name || 'Unknown';
    const size = hp.size ? `S${hp.size}` : '';
    const item = size ? `${size} ${name}` : name;
    const type = hp.type?.toLowerCase() || '';
    
    switch (type) {
      case 'weapons': temp.weapons.push(item); break;
      case 'turrets': temp.turrets.push(item); break;
      case 'missiles': case 'missile_racks': temp.missiles.push(item); break;
      case 'countermeasures': temp.countermeasures.push(item); break;
      case 'power_plants': temp.power_plants.push(item); break;
      case 'coolers': temp.coolers.push(item); break;
      case 'shield_generators': temp.shield_generators.push(item); break;
      case 'quantum_drives': temp.quantum_drives.push(item); break;
      case 'radar': temp.radar.push(item); break;
      case 'main_thrusters': temp.main.push(item); break;
      case 'maneuvering_thrusters': temp.maneuvering.push(item); break;
    }
  }
  
  armament.weapons = deduplicate(temp.weapons);
  armament.turrets = deduplicate(temp.turrets);
  armament.missiles = deduplicate(temp.missiles);
  armament.countermeasures = deduplicate(temp.countermeasures);
  systems.power.power_plants = deduplicate(temp.power_plants);
  systems.power.coolers = deduplicate(temp.coolers);
  systems.power.shield_generators = deduplicate(temp.shield_generators);
  systems.propulsion.quantum_drives = deduplicate(temp.quantum_drives);
  systems.avionics.radar = deduplicate(temp.radar);
  systems.thrusters.main = deduplicate(temp.main);
  systems.thrusters.maneuvering = deduplicate(temp.maneuvering);
  
  return { armament, systems };
}

// Process a single ship
async function processShip(
  title: string,
  fleetYardsSlugs: string[],
  force: boolean,
  quickMode: boolean
): Promise<Vehicle | null> {
  try {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    // Check manual slug mapping first
    const { data: manualMapping } = await supabase
      .from('ship_slug_mappings')
      .select('fleetyards_slug')
      .eq('wiki_title', title)
      .maybeSingle();
    
    const mappedSlug = manualMapping?.fleetyards_slug || findBestFleetYardsSlug(title, fleetYardsSlugs);
    
    // Fetch Wiki data
    const wikiData = await fetchWikiShipData(title);
    if (!wikiData?.query?.pages) return null;
    
    const page = Object.values(wikiData.query.pages)[0] as any;
    if (!page || page.missing) return null;
    
    const wikitext = page.revisions?.[0]?.slots?.main?.['*'] || '';
    const parsed = parseWikitext(wikitext);
    
    // Get image from Wiki
    let imageUrl = page.original?.source || null;
    
    // Fetch FleetYards data
    let fyData: any = null;
    let hardpoints: any = null;
    
    if (mappedSlug) {
      fyData = await fetchFleetYardsShipData(mappedSlug, !force && !quickMode);
      
      if (fyData?.basic) {
        // Get hardpoints from basic data
        if (fyData.basic.hardpoints) {
          hardpoints = mapFleetYardsHardpoints(fyData.basic.hardpoints);
        }
        
        // Use FleetYards image if better
        if (fyData.basic.store_image_medium || fyData.basic.store_image) {
          imageUrl = fyData.basic.store_image_medium || fyData.basic.store_image;
        }
        
        // Enrich with FleetYards data
        if (!parsed.manufacturer && fyData.basic.manufacturer?.name) {
          parsed.manufacturer = fyData.basic.manufacturer.name;
        }
        if (!parsed.role && fyData.basic.focus) {
          parsed.role = fyData.basic.focus;
        }
        if (!parsed.size && fyData.basic.size) {
          parsed.size = fyData.basic.size;
        }
        if (!parsed.production_status && fyData.basic.production_status) {
          parsed.production_status = fyData.basic.production_status;
        }
      }
    }
    
    const vehicle: Vehicle = {
      name: title,
      slug,
      manufacturer: parsed.manufacturer,
      role: parsed.role,
      size: parsed.size,
      crew: parsed.crew,
      cargo: parsed.cargo,
      dimensions: parsed.dimensions,
      speeds: parsed.speeds,
      armament: hardpoints?.armament || parsed.armament,
      systems: hardpoints?.systems || parsed.systems,
      prices: parsed.prices,
      patch: parsed.patch,
      production_status: parsed.production_status,
      image_url: imageUrl,
      source_url: `https://starcitizen.tools/${encodeURIComponent(title)}`,
      raw_wiki_data: { parsed },
      fleetyards_slug_used: mappedSlug || undefined,
      fleetyards_images: fyData?.images || [],
      fleetyards_videos: fyData?.videos || [],
      fleetyards_loaners: fyData?.loaners || [],
      fleetyards_variants: fyData?.variants || [],
      fleetyards_modules: fyData?.modules || [],
      fleetyards_snub_crafts: fyData?.snubCrafts || [],
      fleetyards_full_data: fyData?.basic || null,
      raw_fleetyards_data: fyData?.basic ? { model: fyData.basic } : undefined
    };
    
    return vehicle;
  } catch (error) {
    console.error(`Error processing ${title}:`, error);
    return null;
  }
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let progressId: number | null = null;
  let jobHistoryId: number | null = null;
  let consecutiveErrors = 0;

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    const quickMode = url.searchParams.get('quick') === 'true';
    const auto_sync = url.searchParams.get('auto_sync') === 'true';

    console.log('========================================');
    console.log(`🚀 SHIPS SYNC STARTED (${quickMode ? 'QUICK' : 'FULL'} mode)`);
    console.log(`   Force: ${force}, Auto: ${auto_sync}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('========================================');

    // Acquire lock
    const { data: lockAcquired } = await supabase.rpc('acquire_function_lock', {
      p_function_name: FUNCTION_NAME,
      p_lock_duration_seconds: 3600
    });

    if (!lockAcquired) {
      return new Response(
        JSON.stringify({ error: 'Another sync is already in progress' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    // Create job history
    const { data: jobHistory } = await supabase
      .from('cron_job_history')
      .insert({ job_name: FUNCTION_NAME, status: 'running' })
      .select('id')
      .single();
    jobHistoryId = jobHistory?.id || null;

    // Create sync progress
    const { data: progressEntry } = await supabase
      .from('sync_progress')
      .insert({
        function_name: FUNCTION_NAME,
        status: 'running',
        started_at: new Date().toISOString(),
        current_item: 0,
        total_items: 0,
        current_ship_name: 'Initializing...',
        metadata: { auto_sync, force, quick: quickMode }
      })
      .select('id')
      .single();
    progressId = progressEntry?.id || null;

    // Fetch FleetYards slugs
    console.log('📋 Step 1/3: Fetching FleetYards slugs...');
    const fleetYardsSlugs = await fetchAllFleetYardsSlugs();
    console.log(`✓ ${fleetYardsSlugs.length} FleetYards slugs`);

    // Fetch ship titles from Wiki
    console.log('📋 Step 2/3: Fetching ship titles from Wiki...');
    const shipTitles = await fetchShipTitlesFromWiki();
    console.log(`✓ ${shipTitles.length} ships to process`);

    if (shipTitles.length === 0) {
      throw new Error('No ships found');
    }

    // Update total items
    await supabase.from('sync_progress').update({ total_items: shipTitles.length }).eq('id', progressId);

    // Process ships in batches
    console.log('📋 Step 3/3: Processing ships in batches...');
    const vehicles: Vehicle[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failedShips: Array<{ slug: string; name: string; error: string }> = [];

    // Create batches
    const batches: string[][] = [];
    for (let i = 0; i < shipTitles.length; i += BATCH_SIZE) {
      batches.push(shipTitles.slice(i, i + BATCH_SIZE));
    }

    let processed = 0;
    for (const batch of batches) {
      // Check timeout
      if (Date.now() - startTime > MAX_DURATION_MS) {
        console.error('⏱️ Timeout reached, stopping sync');
        break;
      }

      // Check circuit breaker
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('🚨 Circuit breaker triggered');
        break;
      }

      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(title => processShip(title, fleetYardsSlugs, force, quickMode))
      );

      for (let i = 0; i < batchResults.length; i++) {
        processed++;
        const result = batchResults[i];
        const title = batch[i];

        if (result.status === 'fulfilled' && result.value) {
          vehicles.push(result.value);
          consecutiveErrors = 0;
        } else {
          failedCount++;
          consecutiveErrors++;
          failedShips.push({
            slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            name: title,
            error: result.status === 'rejected' ? String(result.reason) : 'No data'
          });
        }

        // Update progress every batch
        if (processed % BATCH_SIZE === 0 || processed === shipTitles.length) {
          await supabase.from('sync_progress').update({
            current_item: processed,
            current_ship_name: title,
            success_count: vehicles.length,
            failed_count: failedCount,
            updated_at: new Date().toISOString()
          }).eq('id', progressId);
        }
      }

      console.log(`  Batch complete: ${processed}/${shipTitles.length} (${vehicles.length} success, ${failedCount} failed)`);
    }

    // Upsert all vehicles to database
    console.log(`💾 Saving ${vehicles.length} ships to database...`);
    
    for (const v of vehicles) {
      try {
        const toHash = { ...v } as any;
        delete toHash.image_url;
        delete toHash.model_glb_url;
        const newHash = await sha256(stableStringify(toHash));

        const { data: existing } = await supabase
          .from('ships')
          .select('hash, image_url, flight_ready_since, production_status')
          .eq('slug', v.slug)
          .maybeSingle();

        const hashChanged = force || !existing || existing.hash !== newHash;

        if (hashChanged) {
          // Detect flight ready transition
          const isFlightReady = v.production_status?.toLowerCase().includes('flight ready');
          const wasFlightReady = existing?.production_status?.toLowerCase().includes('flight ready');
          const becameFlightReady = isFlightReady && !wasFlightReady;

          const payload: any = {
            slug: v.slug,
            name: v.name,
            manufacturer: v.manufacturer,
            role: normalizeShipType(v.role),
            size: normalizeShipType(v.size),
            crew_min: v.crew?.min,
            crew_max: v.crew?.max,
            cargo_scu: v.cargo,
            length_m: v.dimensions?.length,
            beam_m: v.dimensions?.beam,
            height_m: v.dimensions?.height,
            scm_speed: v.speeds?.scm,
            max_speed: v.speeds?.max,
            armament: v.armament,
            systems: v.systems,
            prices: v.prices,
            patch: v.patch,
            production_status: v.production_status,
            image_url: v.image_url || existing?.image_url,
            hash: newHash,
            updated_at: new Date().toISOString(),
            fleetyards_slug_used: v.fleetyards_slug_used,
            fleetyards_images: v.fleetyards_images,
            fleetyards_videos: v.fleetyards_videos,
            fleetyards_loaners: v.fleetyards_loaners,
            fleetyards_variants: v.fleetyards_variants,
            fleetyards_modules: v.fleetyards_modules,
            fleetyards_snub_crafts: v.fleetyards_snub_crafts,
            fleetyards_full_data: v.fleetyards_full_data,
            raw_fleetyards_data: v.raw_fleetyards_data,
            source: { source: 'wiki+fleetyards', ts: new Date().toISOString() },
            data_sources: {
              wiki: { has_data: true, last_fetch: new Date().toISOString() },
              fleetyards: { has_data: !!v.fleetyards_full_data, last_fetch: v.fleetyards_full_data ? new Date().toISOString() : null }
            }
          };

          if (becameFlightReady) {
            payload.flight_ready_since = new Date().toISOString();
            console.log(`🚀 ${v.slug} became FLIGHT READY!`);
          } else if (existing?.flight_ready_since) {
            payload.flight_ready_since = existing.flight_ready_since;
          }

          const { error } = await supabase.from('ships').upsert(payload, { onConflict: 'slug' });
          
          if (error) {
            console.error(`❌ Error upserting ${v.slug}:`, error.message);
            failedCount++;
          } else {
            successCount++;
          }
        } else {
          skippedCount++;
        }
      } catch (e) {
        console.error(`❌ Error saving ${v.slug}:`, e);
        failedCount++;
      }
    }

    // Complete sync
    const duration = Date.now() - startTime;
    
    await supabase.from('sync_progress').update({
      status: 'completed',
      current_item: shipTitles.length,
      success_count: successCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      failed_ships: failedShips.slice(0, 50),
      completed_at: new Date().toISOString(),
      duration_ms: duration
    }).eq('id', progressId);

    await supabase.from('cron_job_history').update({
      status: 'success',
      items_synced: successCount,
      duration_ms: duration
    }).eq('id', jobHistoryId);

    await supabase.rpc('release_function_lock', { p_function_name: FUNCTION_NAME });

    console.log('========================================');
    console.log(`✅ SYNC COMPLETED in ${Math.round(duration / 1000)}s`);
    console.log(`   Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        duration,
        stats: { success: successCount, failed: failedCount, skipped: skippedCount }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ SYNC FAILED:', errorMsg);

    if (progressId) {
      await supabase.from('sync_progress').update({
        status: 'failed',
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      }).eq('id', progressId);
    }

    if (jobHistoryId) {
      await supabase.from('cron_job_history').update({
        status: 'error',
        error_message: errorMsg,
        duration_ms: Date.now() - startTime
      }).eq('id', jobHistoryId);
    }

    await supabase.rpc('release_function_lock', { p_function_name: FUNCTION_NAME });

    return new Response(
      JSON.stringify({ error: errorMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
