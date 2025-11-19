import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STARCITIZEN_API_COM_KEY = Deno.env.get('STARCITIZEN_API_KEY'); // Using STARCITIZEN_API_KEY secret name
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  data_source_used?: string;
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

// Fetch all FleetYards models for slug mapping
async function fetchAllFleetYardsModels(): Promise<Array<{slug: string, name: string, manufacturer: string}>> {
  try {
    // Check cache first
    const { data: cacheData } = await supabase
      .from('fleetyards_models_cache')
      .select('models, expires_at')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (cacheData && new Date(cacheData.expires_at) > new Date()) {
      console.log('✓ Using cached FleetYards models list');
      return cacheData.models as Array<{slug: string, name: string, manufacturer: string}>;
    }
    
    console.log('Fetching all FleetYards slugs from optimized endpoint...');
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds
    
    const response = await fetch('https://api.fleetyards.net/v1/models/slugs', {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`Failed to fetch FleetYards slugs: ${response.status}`);
      return [];
    }
    
    const slugs = await response.json();
    
    if (!Array.isArray(slugs)) {
      console.error('FleetYards API did not return an array');
      return [];
    }
    
    const simplifiedModels = slugs.map((slug: string) => ({
      slug: slug,
      name: '',
      manufacturer: ''
    }));
    
    // Cache the models list (don't await to speed up)
    supabase.from('fleetyards_models_cache').insert({
      models: simplifiedModels,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).then(({ error }) => {
      if (error) {
        console.error('Error caching FleetYards models:', error);
      }
    });
    
    console.log(`✓ Fetched ${simplifiedModels.length} FleetYards slugs`);
    return simplifiedModels;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('⚠️ FleetYards API request timed out after 30s');
    } else {
      console.error('Error fetching FleetYards models:', error);
    }
    return [];
  }
}

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  return matrix[b.length][a.length];
}

// Find best matching FleetYards slug for a Wiki title
async function findBestFleetYardsSlug(
  wikiTitle: string, 
  fleetYardsModels: Array<{slug: string, name: string, manufacturer: string}>
): Promise<string | null> {
  // Step 1: Check manual mapping table
  const { data: manualMapping } = await supabase
    .from('ship_slug_mappings')
    .select('fleetyards_slug')
    .eq('wiki_title', wikiTitle)
    .maybeSingle();
  
  if (manualMapping) {
    console.log(`  ✓ Using manual mapping: ${wikiTitle} → ${manualMapping.fleetyards_slug}`);
    return manualMapping.fleetyards_slug;
  }
  
  // Step 2: Generate base slug from Wiki title
  const baseSlug = wikiTitle.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  // Step 3: Try exact match
  const exactMatch = fleetYardsModels.find(m => m.slug === baseSlug);
  if (exactMatch) {
    console.log(`  ✓ Exact match: ${wikiTitle} → ${baseSlug}`);
    return baseSlug;
  }
  
  // Step 4: Extract base ship name (remove variants like "Executive Edition", "Touring")
  const variantKeywords = ['executive', 'touring', 'explorer', 'military', 'commercial', 'civilian', 'edition', 'variant'];
  let simplifiedName = wikiTitle.toLowerCase();
  for (const keyword of variantKeywords) {
    simplifiedName = simplifiedName.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), '').trim();
  }
  const simplifiedSlug = simplifiedName.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  
  // Step 5: Find all variants of the base ship
  const variants = fleetYardsModels.filter(m => m.slug.startsWith(simplifiedSlug));
  
  if (variants.length === 1) {
    console.log(`  ✓ Found single variant: ${wikiTitle} → ${variants[0].slug}`);
    return variants[0].slug;
  } else if (variants.length > 1) {
    // Multiple variants found - choose the first one or the one without suffix
    const baseVariant = variants.find(v => v.slug === simplifiedSlug) || variants[0];
    console.log(`  ⚠️ Multiple variants found for ${wikiTitle}, using: ${baseVariant.slug}`);
    console.log(`     Other variants: ${variants.map(v => v.slug).join(', ')}`);
    return baseVariant.slug;
  }
  
  // Step 6: Fuzzy matching by name
  const nameMatches = fleetYardsModels
    .map(m => ({
      ...m,
      distance: levenshteinDistance(wikiTitle.toLowerCase(), m.name.toLowerCase())
    }))
    .filter(m => m.distance <= 5)
    .sort((a, b) => a.distance - b.distance);
  
  if (nameMatches.length > 0) {
    console.log(`  ⚠️ Fuzzy match (distance ${nameMatches[0].distance}): ${wikiTitle} → ${nameMatches[0].slug}`);
    return nameMatches[0].slug;
  }
  
  console.log(`  ❌ No FleetYards match found for: ${wikiTitle}`);
  return null;
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

async function fetchParsedHtmlFromWiki(title: string): Promise<string | null> {
  try {
    // Fetch parsed HTML to extract hardpoints table
    const params = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'text',
      format: 'json'
    });
    
    const url = `https://starcitizen.tools/api.php?${params}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      console.error(`Failed to fetch parsed HTML for ${title}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data?.parse?.text?.['*'] || null;
  } catch (error) {
    console.error(`Error fetching parsed HTML for ${title}:`, error);
    return null;
  }
}

function parseHardpointsFromHtml(html: string): any {
  const hardpoints: any = {
    armament: { 
      weapons: [], 
      turrets: [], 
      missiles: [], 
      utility: [],
      countermeasures: []
    },
    systems: {
      avionics: { 
        radar: [], 
        computer: [],
        ping: [],
        scanner: []
      },
      propulsion: { 
        fuel_intakes: [], 
        fuel_tanks: [], 
        quantum_drives: [], 
        quantum_fuel_tanks: [], 
        jump_modules: []
      },
      thrusters: { 
        main: [], 
        maneuvering: [],
        retro: []
      },
      power: { 
        power_plants: [], 
        coolers: [], 
        shield_generators: []
      },
      modular: {
        cargo_modules: [],
        hab_modules: [],
        weapon_modules: [],
        utility_modules: []
      }
    }
  };

  if (!html) return hardpoints;

  // Improved HTML parsing - extract all table rows for a section
  const extractTableData = (sectionName: string): string[] => {
    const results: string[] = [];
    
    // Find the section in a table row with th containing the section name
    // Then capture all td elements that follow in that table
    const sectionRegex = new RegExp(`<tr[^>]*>\\s*<th[^>]*>\\s*${sectionName}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>\\s*</tr>`, 'gi');
    let sectionMatch;
    
    while ((sectionMatch = sectionRegex.exec(html)) !== null) {
      const cellContent = sectionMatch[1];
      
      // Extract individual items - they could be in divs, lists, or just text
      // Remove all HTML tags and split by common separators
      const cleanText = cellContent
        .replace(/<[^>]+>/g, ' ') // Remove HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      if (cleanText && cleanText !== 'N/A' && cleanText !== '-' && cleanText !== '?' && cleanText.length > 0) {
        // Split by common separators if multiple items
        const items = cleanText.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
        results.push(...items);
      }
    }
    
    // Alternative: look for lists (ul/ol) under this section
    const listRegex = new RegExp(`<th[^>]*>\\s*${sectionName}[\\s\\S]*?<ul[^>]*>([\\s\\S]*?)</ul>`, 'gi');
    let listMatch;
    
    while ((listMatch = listRegex.exec(html)) !== null) {
      const listContent = listMatch[1];
      const liRegex = /<li[^>]*>([^<]+)<\/li>/gi;
      let liMatch;
      
      while ((liMatch = liRegex.exec(listContent)) !== null) {
        const value = liMatch[1].trim();
        if (value && value !== 'N/A' && value !== '-' && value !== '?' && value.length > 0) {
          results.push(value);
        }
      }
    }
    
    return results;
  };

  // Extract armament data
  hardpoints.armament.weapons = extractTableData('Weapons');
  hardpoints.armament.turrets = extractTableData('Turrets');
  hardpoints.armament.missiles = extractTableData('Missiles');
  hardpoints.armament.utility = extractTableData('Utility');
  hardpoints.armament.countermeasures = extractTableData('Countermeasures');

  // Extract systems data
  hardpoints.systems.avionics.radar = extractTableData('Radar');
  hardpoints.systems.avionics.computer = extractTableData('Computers?');
  hardpoints.systems.avionics.scanner = extractTableData('Scanners?');
  
  hardpoints.systems.propulsion.quantum_drives = extractTableData('Quantum [Dd]rives?');
  hardpoints.systems.propulsion.quantum_fuel_tanks = extractTableData('Quantum [Ff]uel [Tt]anks?');
  hardpoints.systems.propulsion.jump_modules = extractTableData('Jump [Mm]odules?');
  hardpoints.systems.propulsion.fuel_intakes = extractTableData('Fuel [Ii]ntakes?');
  hardpoints.systems.propulsion.fuel_tanks = extractTableData('Fuel [Tt]anks?');

  hardpoints.systems.thrusters.main = extractTableData('Main [Tt]hrusters?');
  hardpoints.systems.thrusters.maneuvering = extractTableData('Maneuvering [Tt]hrusters?');
  hardpoints.systems.thrusters.retro = extractTableData('Retro [Tt]hrusters?');

  hardpoints.systems.power.power_plants = extractTableData('Power [Pp]lants?');
  hardpoints.systems.power.coolers = extractTableData('Coolers?');
  hardpoints.systems.power.shield_generators = extractTableData('Shield [Gg]enerators?');

  return hardpoints;
}

// Fetch enriched FleetYards data (images, videos, loaners, etc.) with timeout protection
async function fetchEnrichedFleetYardsData(fleetyardsSlug: string): Promise<{
  images: any[],
  videos: any[],
  loaners: any[],
  variants: any[],
  modules: any[],
  snubCrafts: any[],
  fullData: any
} | null> {
  try {
    console.log(`Fetching enriched FleetYards data for: ${fleetyardsSlug}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout
    
    try {
      const endpoints = [
        { key: 'images', url: `https://api.fleetyards.net/v1/models/${fleetyardsSlug}/images` },
        { key: 'videos', url: `https://api.fleetyards.net/v1/models/${fleetyardsSlug}/videos` },
        { key: 'loaners', url: `https://api.fleetyards.net/v1/models/${fleetyardsSlug}/loaners` },
        { key: 'variants', url: `https://api.fleetyards.net/v1/models/${fleetyardsSlug}/variants` },
        { key: 'modules', url: `https://api.fleetyards.net/v1/models/${fleetyardsSlug}/modules` },
        { key: 'snubCrafts', url: `https://api.fleetyards.net/v1/models/${fleetyardsSlug}/snub-crafts` },
        { key: 'fullData', url: `https://api.fleetyards.net/v1/models/${fleetyardsSlug}` }
      ];

      const results: any = {
        images: [],
        videos: [],
        loaners: [],
        variants: [],
        modules: [],
        snubCrafts: [],
        fullData: null
      };

      // Fetch all endpoints in parallel with timeout
      await Promise.all(endpoints.map(async ({ key, url }) => {
        try {
          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          });
          
          if (response.ok) {
            const data = await response.json();
            results[key] = data;
            console.log(`✓ Fetched ${key} for ${fleetyardsSlug}`);
          } else {
            console.warn(`Failed to fetch ${key} for ${fleetyardsSlug}: ${response.status}`);
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            console.warn(`⏱️ Timeout fetching ${key} for ${fleetyardsSlug}`);
          } else {
            console.error(`Error fetching ${key} for ${fleetyardsSlug}:`, error);
          }
        }
      }));

      clearTimeout(timeout);
      return results;
    } catch (timeoutError) {
      clearTimeout(timeout);
      if (timeoutError instanceof Error && timeoutError.name === 'AbortError') {
        console.error(`⏱️ FleetYards enriched data request timed out for ${fleetyardsSlug}`);
      }
      throw timeoutError;
    }
  } catch (error) {
    console.error(`Error fetching enriched FleetYards data for ${fleetyardsSlug}:`, error);
    return null;
  }
}

// Fetch ship hardpoints from FleetYards.net API (with cache)
// Returns { raw, mapped } where raw contains full API responses and mapped contains structured data
async function fetchShipHardpointsFromFleetYards(slug: string, mappedSlug?: string | null, bypassCache: boolean = false): Promise<{ raw: any; mapped: any } | null> {
  try {
    // Use the mapped slug if provided, otherwise use the original slug
    const fleetYardsSlug = (mappedSlug || slug).toLowerCase();
    
    // Check cache first (unless bypassing)
    if (!bypassCache) {
      const { data: cached } = await supabase
        .from('fleetyards_cache')
        .select('*')
        .eq('ship_slug', fleetYardsSlug)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
        
      if (cached) {
        console.log(`  ✓ Using cached FleetYards data for ${fleetYardsSlug}`);
        return cached.data;
      }
    }
    
    console.log(`  Fetching fresh data from FleetYards API for ${slug}...`);
    
    // Fetch basic ship data
    const modelUrl = `https://api.fleetyards.net/v1/models/${fleetYardsSlug}`;
    const modelResponse = await fetch(modelUrl);
    
    if (!modelResponse.ok) {
      console.log(`  ⚠️ FleetYards: Ship ${slug} not found (${modelResponse.status})`);
      return null;
    }
    
    const modelData = await modelResponse.json();
    
    // Fetch hardpoints data
    const hardpointsUrl = `https://api.fleetyards.net/v1/models/${fleetYardsSlug}/hardpoints`;
    const hardpointsResponse = await fetch(hardpointsUrl);
    
    if (!hardpointsResponse.ok) {
      console.log(`  ⚠️ FleetYards: No hardpoints for ${slug} (${hardpointsResponse.status})`);
      return null;
    }
    
    const hardpoints = await hardpointsResponse.json();
    
    console.log(`  ✓ FleetYards API Response for ${slug}:`, JSON.stringify({
      hardpointsCount: hardpoints?.length || 0,
      isArray: Array.isArray(hardpoints),
      firstItem: hardpoints?.[0] ? {
        name: hardpoints[0].name,
        category: hardpoints[0].category,
        type: hardpoints[0].type,
        component: hardpoints[0].component ? {
          name: hardpoints[0].component.name,
          component_class: hardpoints[0].component.component_class
        } : null
      } : null
    }));
    
    if (!Array.isArray(hardpoints) || hardpoints.length === 0) {
      console.log(`  ⚠️ FleetYards: Empty or invalid hardpoints response for ${slug}`);
      return null;
    }
    
    console.log(`  ✓ FleetYards: Found ${hardpoints.length} hardpoints for ${slug}`);
    
    // Map FleetYards data to our structure
    const mappedData = {
      armament: {
        weapons: [] as string[],
        turrets: [] as string[],
        missiles: [] as string[],
        utility: [] as string[],
        countermeasures: [] as string[]
      },
      systems: {
        avionics: {
          radar: [] as string[],
          computer: [] as string[],
          ping: [] as string[],
          scanner: [] as string[]
        },
        propulsion: {
          fuel_intakes: [] as string[],
          fuel_tanks: [] as string[],
          quantum_drives: [] as string[],
          quantum_fuel_tanks: [] as string[],
          jump_modules: [] as string[]
        },
        thrusters: {
          main: [] as string[],
          maneuvering: [] as string[],
          retro: [] as string[],
          vtol: [] as string[]
        },
        power: {
          power_plants: [] as string[],
          coolers: [] as string[],
          shield_generators: [] as string[]
        },
        modular: [] as string[]
      }
    };
    
    // Helper function to deduplicate components with count
    const deduplicate = (items: string[]) => {
      const counts: Record<string, number> = {};
      items.forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
      });
      return Object.entries(counts).map(([name, count]) => 
        count > 1 ? `${name} (x${count})` : name
      );
    };

    console.log(`  📊 Processing ${hardpoints.length} hardpoints from FleetYards...`);
    const typeCounts: Record<string, number> = {};

    // Process each hardpoint
    for (const hp of hardpoints) {
      const componentName = hp.component?.name || hp.name || 'Unknown';
      const size = hp.size ? `S${hp.size}` : '';
      const itemName = size ? `${size} ${componentName}` : componentName;
      
      // Track types for diagnostic
      const hpType = hp.type?.toLowerCase();
      if (hpType) {
        typeCounts[hpType] = (typeCounts[hpType] || 0) + 1;
      }
      
      // Map by type (primary field) instead of category
      switch (hpType) {
        // === ARMAMENT ===
        case 'weapons':
          if (!hp.category || hp.category === 'weapon') {
            mappedData.armament.weapons.push(itemName);
          }
          break;
        
        case 'turrets':
          mappedData.armament.turrets.push(itemName);
          break;
        
        case 'missiles':
        case 'missile_racks':
          mappedData.armament.missiles.push(itemName);
          break;
        
        case 'countermeasures':
          mappedData.armament.countermeasures.push(itemName);
          break;

        // === SYSTEMS - POWER ===
        case 'power_plants':
          mappedData.systems.power.power_plants.push(itemName);
          break;
        
        case 'coolers':
          mappedData.systems.power.coolers.push(itemName);
          break;
        
        case 'shield_generators':
          mappedData.systems.power.shield_generators.push(itemName);
          break;

        // === SYSTEMS - AVIONICS ===
        case 'radar':
          mappedData.systems.avionics.radar.push(itemName);
          break;
        
        case 'computers':
          mappedData.systems.avionics.computer.push(itemName);
          break;
        
        case 'scanners':
          mappedData.systems.avionics.scanner.push(itemName);
          break;

        // === SYSTEMS - PROPULSION ===
        case 'quantum_drives':
          mappedData.systems.propulsion.quantum_drives.push(itemName);
          break;
        
        case 'quantum_fuel_tanks':
          mappedData.systems.propulsion.quantum_fuel_tanks.push(itemName);
          break;
        
        case 'fuel_intakes':
          mappedData.systems.propulsion.fuel_intakes.push(itemName);
          break;
        
        case 'fuel_tanks':
          mappedData.systems.propulsion.fuel_tanks.push(itemName);
          break;
        
        case 'jump_modules':
          mappedData.systems.propulsion.jump_modules.push(itemName);
          break;

        // === SYSTEMS - THRUSTERS ===
        case 'main_thrusters':
          if (hp.category === 'main') {
            mappedData.systems.thrusters.main.push(itemName);
          } else if (hp.category === 'retro') {
            mappedData.systems.thrusters.retro.push(itemName);
          }
          break;
        
        case 'maneuvering_thrusters':
          if (hp.category === 'joint') {
            mappedData.systems.thrusters.maneuvering.push(itemName);
          }
          break;
        
        case 'vtol_thrusters':
          mappedData.systems.thrusters.vtol.push(itemName);
          break;

        default:
          // Log unmapped types for future improvement
          if (hpType && hpType !== 'unknown') {
            console.log(`  ⚠️  Unmapped hardpoint type: ${hpType} (${componentName})`);
          }
      }
    }

    // Deduplicate all arrays
    mappedData.armament.weapons = deduplicate(mappedData.armament.weapons);
    mappedData.armament.turrets = deduplicate(mappedData.armament.turrets);
    mappedData.armament.missiles = deduplicate(mappedData.armament.missiles);
    mappedData.armament.countermeasures = deduplicate(mappedData.armament.countermeasures);
    mappedData.systems.power.power_plants = deduplicate(mappedData.systems.power.power_plants);
    mappedData.systems.power.coolers = deduplicate(mappedData.systems.power.coolers);
    mappedData.systems.power.shield_generators = deduplicate(mappedData.systems.power.shield_generators);
    mappedData.systems.avionics.radar = deduplicate(mappedData.systems.avionics.radar);
    mappedData.systems.avionics.computer = deduplicate(mappedData.systems.avionics.computer);
    mappedData.systems.avionics.scanner = deduplicate(mappedData.systems.avionics.scanner);
    mappedData.systems.propulsion.quantum_drives = deduplicate(mappedData.systems.propulsion.quantum_drives);
    mappedData.systems.propulsion.quantum_fuel_tanks = deduplicate(mappedData.systems.propulsion.quantum_fuel_tanks);
    mappedData.systems.propulsion.fuel_intakes = deduplicate(mappedData.systems.propulsion.fuel_intakes);
    mappedData.systems.propulsion.fuel_tanks = deduplicate(mappedData.systems.propulsion.fuel_tanks);
    mappedData.systems.propulsion.jump_modules = deduplicate(mappedData.systems.propulsion.jump_modules);
    mappedData.systems.thrusters.main = deduplicate(mappedData.systems.thrusters.main);
    mappedData.systems.thrusters.retro = deduplicate(mappedData.systems.thrusters.retro);
    mappedData.systems.thrusters.maneuvering = deduplicate(mappedData.systems.thrusters.maneuvering);
    mappedData.systems.thrusters.vtol = deduplicate(mappedData.systems.thrusters.vtol);

    // Log diagnostic information
    console.log(`  📈 Hardpoint types found:`, typeCounts);
    const countItems = (obj: any): number => {
      if (Array.isArray(obj)) return obj.length;
      return Object.values(obj).reduce((sum: number, val: any) => sum + countItems(val), 0);
    };
    console.log(`  ✅ Mapped data summary:`, {
      armament: countItems(mappedData.armament),
      systems: {
        power: countItems(mappedData.systems.power),
        avionics: countItems(mappedData.systems.avionics),
        propulsion: countItems(mappedData.systems.propulsion),
        thrusters: countItems(mappedData.systems.thrusters)
      }
    });
    
    // Create the return object with both raw and mapped data
    const result = {
      raw: {
        model: modelData,
        hardpoints: hardpoints,
        slug: fleetYardsSlug
      },
      mapped: mappedData
    };
    
    // Store in cache with the full result object
    if (result) {
      await supabase
        .from('fleetyards_cache')
        .upsert({
          ship_slug: fleetYardsSlug,
          data: result,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });
      console.log(`  ✓ Cached FleetYards data for ${slug} (expires in 7 days)`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`  ❌ Error fetching from FleetYards for ${slug}:`, error);
    return null;
  }
}

// Fallback: Fetch ship hardpoints from StarCitizen-API.com
async function fetchShipHardpointsFromStarCitizenAPI(slug: string): Promise<any> {
  try {
    const apiKey = Deno.env.get('STARCITIZEN_API_COM_KEY');
    if (!apiKey) {
      console.log('  ⚠️ StarCitizen-API.com key not configured');
      return null;
    }
    
    console.log(`  Trying StarCitizen-API.com fallback for ${slug}...`);
    
    const url = `https://api.starcitizen-api.com/${apiKey}/v1/eager/vehicles/${slug}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`  ⚠️ StarCitizen-API.com: Ship ${slug} not found (${response.status})`);
      return null;
    }
    
    const data = await response.json();
    
    // Map to our structure (simplified)
    const mappedData = {
      armament: {
        weapons: data.data?.weapons || [],
        turrets: data.data?.turrets || [],
        missiles: data.data?.missiles || [],
        utility: [],
        countermeasures: []
      },
      systems: {
        avionics: { radar: [], computer: [], ping: [], scanner: [] },
        propulsion: { 
          fuel_intakes: [], 
          fuel_tanks: [], 
          quantum_drives: data.data?.quantum_drives || [],
          quantum_fuel_tanks: [], 
          jump_modules: [] 
        },
        thrusters: { main: [], maneuvering: [], retro: [] },
        power: { 
          power_plants: data.data?.power_plants || [],
          coolers: data.data?.coolers || [],
          shield_generators: data.data?.shields || []
        },
        modular: []
      }
    };
    
    console.log(`  ✓ StarCitizen-API.com: Got data for ${slug}`);
    return mappedData;
    
  } catch (error) {
    console.error(`  ❌ Error from StarCitizen-API.com for ${slug}:`, error);
    return null;
  }
}

function parseWikitext(wikitext: string): any {
  const extracted: any = {
    armament: { 
      weapons: [], 
      turrets: [], 
      missiles: [], 
      utility: [],
      countermeasures: []
    },
    systems: {
      avionics: { 
        radar: [], 
        computer: [],
        ping: [],
        scanner: []
      },
      propulsion: { 
        fuel_intakes: [], 
        fuel_tanks: [], 
        quantum_drives: [], 
        quantum_fuel_tanks: [], 
        jump_modules: []
      },
      thrusters: { 
        main: [], 
        maneuvering: [],
        retro: []
      },
      power: { 
        power_plants: [], 
        coolers: [], 
        shield_generators: []
      },
      modular: {
        cargo_modules: [],
        hab_modules: [],
        weapon_modules: [],
        utility_modules: []
      }
    }
  };
  
  const cleanValue = (val: string): string => {
    if (!val) return '';
    return val
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')  // [[link|text]] -> text
      .replace(/\[\[([^\]]+)\]\]/g, '$1')             // [[link]] -> link
      .replace(/\{\{[^}]+\}\}/g, '')                  // Remove templates
      .replace(/<[^>]+>/g, '')                        // Remove HTML tags
      .replace(/<!--.*?-->/g, '')                     // Remove comments
      .replace(/\n/g, ' ')                            // Replace newlines with spaces
      .replace(/\s+/g, ' ')                           // Normalize whitespace
      .trim();
  };
  
  // Helper to extract numeric values with various formats
  const extractNumber = (text: string, pattern: RegExp): number | undefined => {
    const match = text.match(pattern);
    if (match && match[1]) {
      const cleaned = match[1].replace(/[,\s]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? undefined : num;
    }
    return undefined;
  };
  
  // Extract manufacturer - try multiple patterns
  const manufacturerPatterns = [
    /\|\s*manufacturer\s*=\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/i,
    /\|\s*manufacturer\s*=\s*([^\n|{]+)/i,
    /manufacturer\s*=\s*\[\[([^\]|]+)/i
  ];
  
  for (const pattern of manufacturerPatterns) {
    const match = wikitext.match(pattern);
    if (match && match[1]) {
      extracted.manufacturer = cleanValue(match[1]);
      if (extracted.manufacturer && extracted.manufacturer !== 'N/A') {
        console.log(`  Manufacturer: ${extracted.manufacturer}`);
        break;
      }
    }
  }
  
  // Extract role/focus - try multiple field names
  const rolePatterns = [
    /\|\s*(?:focus|role|career|classification|type)\s*=\s*([^\n|{]+)/i,
    /role\s*=\s*\[\[([^\]|]+)/i
  ];
  
  for (const pattern of rolePatterns) {
    const match = wikitext.match(pattern);
    if (match && match[1]) {
      extracted.role = cleanValue(match[1]);
      if (extracted.role && extracted.role !== 'N/A') {
        console.log(`  Role: ${extracted.role}`);
        break;
      }
    }
  }
  
  // Extract size - try multiple patterns
  const sizePatterns = [
    /\|\s*size\s*=\s*([^\n|{]+)/i,
    /\|\s*(?:vehicle[\s_-]size|ship[\s_-]size)\s*=\s*([^\n|{]+)/i
  ];
  
  for (const pattern of sizePatterns) {
    const match = wikitext.match(pattern);
    if (match && match[1]) {
      extracted.size = cleanValue(match[1]);
      if (extracted.size && extracted.size !== 'N/A') {
        console.log(`  Size: ${extracted.size}`);
        break;
      }
    }
  }
  
  // Extract crew - try multiple patterns for min/max
  const crewPatterns = {
    min: [
      /\|\s*(?:min[\s_-]?crew|crew[\s_-]?min)\s*=\s*(\d+)/i,
      /\|\s*crew\s*=\s*(\d+)(?:\s*[-–—]\s*\d+)?/i
    ],
    max: [
      /\|\s*(?:max[\s_-]?crew|crew[\s_-]?max)\s*=\s*(\d+)/i,
      /\|\s*crew\s*=\s*\d+\s*[-–—]\s*(\d+)/i
    ]
  };
  
  for (const pattern of crewPatterns.min) {
    const num = extractNumber(wikitext, pattern);
    if (num !== undefined) {
      if (!extracted.crew) extracted.crew = {};
      extracted.crew.min = num;
      break;
    }
  }
  
  for (const pattern of crewPatterns.max) {
    const num = extractNumber(wikitext, pattern);
    if (num !== undefined) {
      if (!extracted.crew) extracted.crew = {};
      extracted.crew.max = num;
      break;
    }
  }
  
  if (extracted.crew) {
    console.log(`  Crew: ${extracted.crew.min || '?'}-${extracted.crew.max || '?'}`);
  }
  
  // Extract cargo - try multiple patterns
  const cargoPatterns = [
    /\|\s*cargo[\s_-]?(?:capacity)?\s*=\s*([\d.,]+)/i,
    /\|\s*scu\s*=\s*([\d.,]+)/i,
    /cargo.*?([\d.,]+)\s*scu/i
  ];
  
  for (const pattern of cargoPatterns) {
    const num = extractNumber(wikitext, pattern);
    if (num !== undefined) {
      extracted.cargo = num;
      console.log(`  Cargo: ${extracted.cargo} SCU`);
      break;
    }
  }
  
  // Extract dimensions - try multiple patterns
  const dimensionPatterns = {
    length: [
      /\|\s*length\s*=\s*([\d.,]+)/i,
      /length.*?([\d.,]+)\s*m/i
    ],
    beam: [
      /\|\s*(?:beam|width)\s*=\s*([\d.,]+)/i,
      /(?:beam|width).*?([\d.,]+)\s*m/i
    ],
    height: [
      /\|\s*height\s*=\s*([\d.,]+)/i,
      /height.*?([\d.,]+)\s*m/i
    ]
  };
  
  for (const pattern of dimensionPatterns.length) {
    const num = extractNumber(wikitext, pattern);
    if (num !== undefined) {
      if (!extracted.dimensions) extracted.dimensions = {};
      extracted.dimensions.length = num;
      break;
    }
  }
  
  for (const pattern of dimensionPatterns.beam) {
    const num = extractNumber(wikitext, pattern);
    if (num !== undefined) {
      if (!extracted.dimensions) extracted.dimensions = {};
      extracted.dimensions.beam = num;
      break;
    }
  }
  
  for (const pattern of dimensionPatterns.height) {
    const num = extractNumber(wikitext, pattern);
    if (num !== undefined) {
      if (!extracted.dimensions) extracted.dimensions = {};
      extracted.dimensions.height = num;
      break;
    }
  }
  
  if (extracted.dimensions) {
    console.log(`  Dimensions: ${extracted.dimensions.length || '?'}x${extracted.dimensions.beam || '?'}x${extracted.dimensions.height || '?'} m`);
  }
  
  // Extract speeds - try multiple patterns
  const speedPatterns = {
    scm: [
      /\|\s*(?:scm[\s_-]?speed|speed[\s_-]?scm)\s*=\s*([\d.,]+)/i,
      /scm.*?([\d.,]+)\s*m\/s/i
    ],
    max: [
      /\|\s*(?:max[\s_-]?speed|afterburner[\s_-]?speed|speed[\s_-]?max)\s*=\s*([\d.,]+)/i,
      /(?:max|afterburner).*?([\d.,]+)\s*m\/s/i
    ]
  };
  
  for (const pattern of speedPatterns.scm) {
    const num = extractNumber(wikitext, pattern);
    if (num !== undefined) {
      if (!extracted.speeds) extracted.speeds = {};
      extracted.speeds.scm = num;
      break;
    }
  }
  
  for (const pattern of speedPatterns.max) {
    const num = extractNumber(wikitext, pattern);
    if (num !== undefined) {
      if (!extracted.speeds) extracted.speeds = {};
      extracted.speeds.max = num;
      break;
    }
  }
  
  if (extracted.speeds) {
    console.log(`  Speeds: SCM ${extracted.speeds.scm || '?'} / Max ${extracted.speeds.max || '?'} m/s`);
  }
  
  // Extract armament - weapons, turrets, missiles, utility
  const weaponsMatches = wikitext.matchAll(/\|\s*weapons?\s*=\s*([^\n|]+)/gi);
  for (const match of weaponsMatches) {
    const value = cleanValue(match[1]);
    if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
      extracted.armament.weapons.push(value);
    }
  }
  
  const turretsMatches = wikitext.matchAll(/\|\s*turrets?\s*=\s*([^\n|]+)/gi);
  for (const match of turretsMatches) {
    const value = cleanValue(match[1]);
    if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
      extracted.armament.turrets.push(value);
    }
  }
  
  const missilesMatches = wikitext.matchAll(/\|\s*missiles?\s*=\s*([^\n|]+)/gi);
  for (const match of missilesMatches) {
    const value = cleanValue(match[1]);
    if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
      extracted.armament.missiles.push(value);
    }
  }
  
  const utilityMatches = wikitext.matchAll(/\|\s*utility[\s_-]?items?\s*=\s*([^\n|]+)/gi);
  for (const match of utilityMatches) {
    const value = cleanValue(match[1]);
    if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
      extracted.armament.utility.push(value);
    }
  }
  
  // Extract systems - avionics (multiple components per type)
  const componentPatterns = {
    radar: /\|\s*(?:radar|avionics)\s*=\s*([^\n|]+)/gi,
    computer: /\|\s*computer\s*=\s*([^\n|]+)/gi,
    ping: /\|\s*ping\s*=\s*([^\n|]+)/gi,
    scanner: /\|\s*scanner\s*=\s*([^\n|]+)/gi
  };
  
  for (const [key, pattern] of Object.entries(componentPatterns)) {
    const matches = wikitext.matchAll(pattern);
    for (const match of matches) {
      const value = cleanValue(match[1]);
      if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
        extracted.systems.avionics[key].push(value);
      }
    }
  }
  
  // Extract systems - propulsion (multiple components per type)
  const propulsionPatterns = {
    fuel_intakes: /\|\s*fuel[\s_-]?intakes?\s*=\s*([^\n|]+)/gi,
    fuel_tanks: /\|\s*fuel[\s_-]?tanks?\s*=\s*([^\n|]+)/gi,
    quantum_drives: /\|\s*quantum[\s_-]?drives?\s*=\s*([^\n|]+)/gi,
    quantum_fuel_tanks: /\|\s*quantum[\s_-]?fuel[\s_-]?tanks?\s*=\s*([^\n|]+)/gi,
    jump_modules: /\|\s*jump[\s_-]?modules?\s*=\s*([^\n|]+)/gi
  };
  
  for (const [key, pattern] of Object.entries(propulsionPatterns)) {
    const matches = wikitext.matchAll(pattern);
    for (const match of matches) {
      const value = cleanValue(match[1]);
      if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
        extracted.systems.propulsion[key].push(value);
      }
    }
  }
  
  // Extract systems - thrusters (multiple components per type)
  const thrusterPatterns = {
    main: /\|\s*main[\s_-]?thrusters?\s*=\s*([^\n|]+)/gi,
    maneuvering: /\|\s*(?:maneuvering|maneuver)[\s_-]?thrusters?\s*=\s*([^\n|]+)/gi,
    retro: /\|\s*retro[\s_-]?thrusters?\s*=\s*([^\n|]+)/gi
  };
  
  for (const [key, pattern] of Object.entries(thrusterPatterns)) {
    const matches = wikitext.matchAll(pattern);
    for (const match of matches) {
      const value = cleanValue(match[1]);
      if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
        extracted.systems.thrusters[key].push(value);
      }
    }
  }
  
  // Extract systems - power (multiple components per type)
  const powerPatterns = {
    power_plants: /\|\s*power[\s_-]?plants?\s*=\s*([^\n|]+)/gi,
    coolers: /\|\s*coolers?\s*=\s*([^\n|]+)/gi,
    shield_generators: /\|\s*shield[\s_-]?generators?\s*=\s*([^\n|]+)/gi
  };
  
  for (const [key, pattern] of Object.entries(powerPatterns)) {
    const matches = wikitext.matchAll(pattern);
    for (const match of matches) {
      const value = cleanValue(match[1]);
      if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
        extracted.systems.power[key].push(value);
      }
    }
  }
  
  // Extract countermeasures
  const countermeasureMatches = wikitext.matchAll(/\|\s*countermeasures?\s*=\s*([^\n|]+)/gi);
  for (const match of countermeasureMatches) {
    const value = cleanValue(match[1]);
    if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
      extracted.armament.countermeasures.push(value);
    }
  }
  
  // Extract modular components
  const modularPatterns = {
    cargo_modules: /\|\s*cargo[\s_-]?modules?\s*=\s*([^\n|]+)/gi,
    hab_modules: /\|\s*hab(?:itation)?[\s_-]?modules?\s*=\s*([^\n|]+)/gi,
    weapon_modules: /\|\s*weapon[\s_-]?modules?\s*=\s*([^\n|]+)/gi,
    utility_modules: /\|\s*utility[\s_-]?modules?\s*=\s*([^\n|]+)/gi
  };
  
  for (const [key, pattern] of Object.entries(modularPatterns)) {
    const matches = wikitext.matchAll(pattern);
    for (const match of matches) {
      const value = cleanValue(match[1]);
      if (value && value !== 'N/A' && value.toLowerCase() !== 'n/a' && value !== 'None' && value.length > 0) {
        extracted.systems.modular[key].push(value);
      }
    }
  }
  
  // Extract price - try multiple patterns
  const pricePatterns = [
    /\|\s*(?:price|pledge[\s_-]?price|msrp)\s*=\s*\$?\s*([\d,]+)/i,
    /\$\s*([\d,]+)\s*(?:USD|usd)/i
  ];
  
  for (const pattern of pricePatterns) {
    const match = wikitext.match(pattern);
    if (match && match[1]) {
      const price = parseInt(match[1].replace(/,/g, ''));
      if (!isNaN(price) && price > 0) {
        extracted.prices = [{ amount: price, currency: 'USD' }];
        console.log(`  Price: $${price}`);
        break;
      }
    }
  }
  
  // Extract production status - try multiple patterns
  const statusPatterns = [
    /\|\s*(?:production[\s_-]?status|status|availability)\s*=\s*([^\n|{]+)/i,
    /status\s*=\s*\[\[([^\]|]+)/i
  ];
  
  for (const pattern of statusPatterns) {
    const match = wikitext.match(pattern);
    if (match && match[1]) {
      extracted.production_status = cleanValue(match[1]);
      if (extracted.production_status && extracted.production_status !== 'N/A') {
        console.log(`  Production Status: ${extracted.production_status}`);
        break;
      }
    }
  }
  
  // Extract patch/version info
  const patchPatterns = [
    /\|\s*(?:patch|version|release)\s*=\s*([^\n|{]+)/i,
    /(?:patch|version)\s*([0-9.]+)/i
  ];
  
  for (const pattern of patchPatterns) {
    const match = wikitext.match(pattern);
    if (match && match[1]) {
      extracted.patch = cleanValue(match[1]);
      if (extracted.patch && extracted.patch !== 'N/A') {
        console.log(`  Patch: ${extracted.patch}`);
        break;
      }
    }
  }
  
  // Keep empty arrays instead of deleting them - frontend expects arrays (even if empty)
  // This ensures consistent data structure in the database
  
  // Log what we found for debugging
  const hasArmament = Object.values(extracted.armament || {}).some((arr: any) => arr?.length > 0);
  const hasSystems = Object.values(extracted.systems || {}).some((group: any) => 
    Object.values(group || {}).some((arr: any) => arr?.length > 0)
  );
  
  if (hasArmament) {
    console.log(`  ✓ Armament: ${JSON.stringify(extracted.armament)}`);
  }
  if (hasSystems) {
    console.log(`  ✓ Systems detected`);
    if (extracted.systems.avionics) console.log(`    - Avionics: ${JSON.stringify(extracted.systems.avionics)}`);
    if (extracted.systems.propulsion) console.log(`    - Propulsion: ${JSON.stringify(extracted.systems.propulsion)}`);
    if (extracted.systems.thrusters) console.log(`    - Thrusters: ${JSON.stringify(extracted.systems.thrusters)}`);
    if (extracted.systems.power) console.log(`    - Power: ${JSON.stringify(extracted.systems.power)}`);
    if (extracted.systems.modular) console.log(`    - Modular: ${JSON.stringify(extracted.systems.modular)}`);
  }
  
  return extracted;
}

async function fetchStarCitizenAPIVehicles(): Promise<{
  vehicles: Vehicle[];
  sourceCounts: {
    wiki: number;
    fleetyards: number;
    starcitizen_api: number;
    wiki_fallback: number;
    api_failures: number;
    manual_preference: number;
    slug_mapping_failures: number;
  };
}> {
  const sourceCounts = {
    wiki: 0,
    fleetyards: 0,
    starcitizen_api: 0,
    wiki_fallback: 0,
    api_failures: 0,
    manual_preference: 0,
    slug_mapping_failures: 0
  };
  
  try {
    console.log('🚀 Starting ship sync from Star Citizen Wiki...');
    
    // Step 1: Fetch all FleetYards models for slug mapping
    console.log('📋 Fetching FleetYards models list...');
    const fleetYardsModels = await fetchAllFleetYardsModels();
    console.log(`✓ Retrieved ${fleetYardsModels.length} FleetYards models for mapping`);
    
    // Step 2: Get all ship titles from Wiki
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
        
        // Find the best FleetYards slug for this Wiki title
        console.log(`  🔍 Finding FleetYards slug for: ${title}`);
        const mappedFleetYardsSlug = await findBestFleetYardsSlug(title, fleetYardsModels);
        
        if (!mappedFleetYardsSlug) {
          console.log(`  ⚠️ No FleetYards slug found for ${title}`);
          sourceCounts.slug_mapping_failures++;
        }
        
        // Fetch parsed HTML to extract hardpoints from {{Vehicle hardpoints}} template
        console.log(`  Fetching hardpoints table for ${title}...`);
        const parsedHtml = await fetchParsedHtmlFromWiki(title);
        const hardpointsData = parseHardpointsFromHtml(parsedHtml || '');
        
        // Merge hardpoints data into parsed data (overwrite with HTML-extracted data)
        parsedData.armament = hardpointsData.armament;
        parsedData.systems = hardpointsData.systems;
        
        // Store raw Wiki data before merging with API data
        const wikiRawData = {
          armament: JSON.parse(JSON.stringify(parsedData.armament)),
          systems: JSON.parse(JSON.stringify(parsedData.systems))
        };
        
        // Try to fetch from FleetYards API (with mapped slug and cache)
        let fleetYardsData = null;
        let fleetYardsRawData = null;
        let usedFleetYardsSlug = null;
        let enrichedData = null;
        
        if (mappedFleetYardsSlug) {
          const result = await fetchShipHardpointsFromFleetYards(slug, mappedFleetYardsSlug);
          if (result) {
            fleetYardsData = result.mapped;
            fleetYardsRawData = result.raw;
            usedFleetYardsSlug = mappedFleetYardsSlug;
            
            // Fetch enriched FleetYards data
            console.log(`  Fetching enriched data for ${mappedFleetYardsSlug}...`);
            enrichedData = await fetchEnrichedFleetYardsData(mappedFleetYardsSlug);
          }
        }
        
        let usedStarCitizenAPI = false;
        
        // Fallback to StarCitizen-API.com if FleetYards fails
        if (!fleetYardsData) {
          if (mappedFleetYardsSlug) {
            console.log(`  ⚠️ FleetYards unavailable for ${mappedFleetYardsSlug}, trying StarCitizen-API.com...`);
          }
          fleetYardsData = await fetchShipHardpointsFromStarCitizenAPI(slug);
          usedStarCitizenAPI = !!fleetYardsData;
          if (!fleetYardsData) {
            sourceCounts.api_failures++;
          }
        }
        
        // Check if there's a manual preference for this ship
        const { data: preference } = await supabase
          .from('ship_data_preferences')
          .select('preferred_source')
          .eq('ship_slug', slug)
          .maybeSingle();
        
        let finalArmament = parsedData.armament;
        let finalSystems = parsedData.systems;
        let dataSourceUsed = 'wiki';
        
        if (preference?.preferred_source === 'fleetyards' && fleetYardsData) {
          console.log(`  ✓ Using FleetYards data (manual preference)`);
          finalArmament = fleetYardsData.armament;
          finalSystems = fleetYardsData.systems;
          dataSourceUsed = 'fleetyards';
          sourceCounts.manual_preference++;
          sourceCounts.fleetyards++;
        } else if (preference?.preferred_source === 'wiki') {
          console.log(`  ✓ Using Wiki data (manual preference)`);
          dataSourceUsed = 'wiki';
          sourceCounts.manual_preference++;
          sourceCounts.wiki++;
        } else if (fleetYardsData) {
          // Auto-merge logic: Use FleetYards if Wiki data is empty or less detailed
          const wikiHasArmament = Object.values(parsedData.armament || {}).some((arr: any) => arr?.length > 0);
          const wikiHasSystems = Object.values(parsedData.systems || {}).some((group: any) => 
            Object.values(group || {}).some((arr: any) => arr?.length > 0)
          );
          
          if (!wikiHasArmament && fleetYardsData.armament) {
            console.log(`  ✓ Using FleetYards armament data (Wiki had none)`);
            finalArmament = fleetYardsData.armament;
            dataSourceUsed = usedStarCitizenAPI ? 'starcitizen_api' : 'fleetyards';
            if (usedStarCitizenAPI) {
              sourceCounts.starcitizen_api++;
            } else {
              sourceCounts.fleetyards++;
            }
          }
          
          if (!wikiHasSystems && fleetYardsData.systems) {
            console.log(`  ✓ Using FleetYards systems data (Wiki had none)`);
            finalSystems = fleetYardsData.systems;
            dataSourceUsed = usedStarCitizenAPI ? 'starcitizen_api' : 'fleetyards';
            if (usedStarCitizenAPI) {
              sourceCounts.starcitizen_api++;
            } else {
              sourceCounts.fleetyards++;
            }
          } else if (wikiHasArmament || wikiHasSystems) {
            sourceCounts.wiki_fallback++;
          }
        } else {
          // No API data available, using Wiki only
          sourceCounts.wiki++;
        }
        
        parsedData.armament = finalArmament;
        parsedData.systems = finalSystems;
        
        // Skip if this doesn't look like a real ship (no manufacturer = not a ship)
        if (!parsedData.manufacturer && !wikitext.toLowerCase().includes('manufacturer')) {
          console.log(`⊘ Skipped ${title} (not a ship - no manufacturer)`);
          continue;
        }
        
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
          production_status: parsedData.production_status,
          image_url,
          model_glb_url: undefined,
          source_url: page.fullurl || `https://starcitizen.tools/${encodeURIComponent(title.replace(/ /g, '_'))}`,
          armament: parsedData.armament,
          systems: parsedData.systems,
          raw_wiki_data: wikiRawData,
          raw_fleetyards_data: fleetYardsRawData,
          data_source_used: dataSourceUsed,
          fleetyards_slug_used: usedFleetYardsSlug,
          fleetyards_images: enrichedData?.images || [],
          fleetyards_videos: enrichedData?.videos || [],
          fleetyards_loaners: enrichedData?.loaners || [],
          fleetyards_variants: enrichedData?.variants || [],
          fleetyards_modules: enrichedData?.modules || [],
          fleetyards_snub_crafts: enrichedData?.snubCrafts || [],
          fleetyards_full_data: enrichedData?.fullData || null
        } as any;
        
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
    return { vehicles, sourceCounts };
  } catch (error) {
    console.error('Error fetching vehicles from Star Citizen Wiki:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const FUNCTION_NAME = 'ships-sync';
  const LOCK_DURATION = 600; // 10 minutes max for this heavy function
  const MAX_DURATION_MS = 15 * 60 * 1000; // 15 minutes timeout
  const startTime = Date.now();
  let jobHistoryId: number | null = null;
  let progressId: number | null = null;
  let force = false;
  let auto_sync = false;
  let lockAcquired = false;
  
  // Global timeout controller
  const abortController = new AbortController();
  const globalTimeout = setTimeout(() => {
    console.error(`[${FUNCTION_NAME}] 🚨 GLOBAL TIMEOUT REACHED (${MAX_DURATION_MS / 1000 / 60} minutes)`);
    abortController.abort();
  }, MAX_DURATION_MS);
  
  // Circuit breaker: track consecutive errors
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;
  
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      force = !!body?.force;
      auto_sync = !!body?.auto_sync;
    }
  } catch (_) {
    force = false;
    auto_sync = false;
  }

  try {
    console.log(`[${FUNCTION_NAME}] Attempting to acquire lock...`);

    // Try to acquire lock
    const { data: lockData, error: lockError } = await supabase
      .rpc('acquire_function_lock', {
        p_function_name: FUNCTION_NAME,
        p_lock_duration_seconds: LOCK_DURATION
      });

    if (lockError) {
      console.error(`[${FUNCTION_NAME}] Lock error:`, lockError);
      throw lockError;
    }

    if (!lockData) {
      console.log(`[${FUNCTION_NAME}] Another instance is already running. Skipping.`);
      return new Response(
        JSON.stringify({
          ok: false,
          message: 'Another instance is already running',
          skipped: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    lockAcquired = true;

    console.log(`[${FUNCTION_NAME}] Lock acquired. Starting ships sync... (${auto_sync ? 'AUTO' : 'MANUAL'}, force: ${force})`);
    
    // Create job history entry
    console.log('[ships-sync] Creating cron_job_history entry...');
    const { data: jobHistory, error: jobHistoryError } = await supabase
      .from('cron_job_history')
      .insert({
        job_name: FUNCTION_NAME,
        status: 'running'
      })
      .select('id')
      .single();
    
    if (jobHistoryError) {
      console.error('[ships-sync] ❌ Error creating job history:', jobHistoryError);
    } else {
      console.log(`[ships-sync] ✓ Job history created: ${jobHistory?.id}`);
    }
    
    jobHistoryId = jobHistory?.id || null;
    
    // Create sync progress entry BEFORE fetching data
    console.log('[ships-sync] Creating sync_progress entry...');
    const { data: progressEntry, error: progressError } = await supabase
      .from('sync_progress')
      .insert({
        function_name: FUNCTION_NAME,
        status: 'running',
        started_at: new Date().toISOString(),
        current_item: 0,
        total_items: 0,
        current_ship_name: 'Initializing...',
        current_ship_slug: null,
        metadata: {
          auto_sync,
          force,
          source: auto_sync ? 'cron' : 'admin_panel'
        }
      })
      .select('id')
      .single();
    
    if (progressError) {
      console.error('[ships-sync] ❌ Failed to create sync_progress entry:', progressError);
      throw progressError;
    }
    
    progressId = progressEntry?.id || null;
    console.log(`[ships-sync] ✓ Progress entry created: ${progressId}`);
    
    // Now fetch vehicles
    console.log('[ships-sync] Starting fetchStarCitizenAPIVehicles...');
    const { vehicles, sourceCounts } = await fetchStarCitizenAPIVehicles();
    console.log(`[ships-sync] ✓ Fetched ${vehicles.length} vehicles from multiple sources`);
    
    // Update total_items after fetching
    await supabase
      .from('sync_progress')
      .update({ 
        total_items: vehicles.length,
        current_ship_name: vehicles.length > 0 ? vehicles[0].name : 'No vehicles'
      })
      .eq('id', progressId);
    
    // Track success/failed ships for detailed reporting
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failedShips: Array<{slug: string, name: string, error: string}> = [];
    
    let upserts = 0;
    let errors = 0;
    let currentIndex = 0;
    let lastHeartbeat = Date.now();

    for (const v of vehicles) {
      // Check timeout
      if (Date.now() - startTime > MAX_DURATION_MS) {
        throw new Error(`Timeout: sync exceeded ${MAX_DURATION_MS / 1000 / 60} minutes`);
      }
      
      currentIndex++;
      const now = Date.now();
      
      // Update progress more frequently: every 3 items or on first/last item
      const shouldUpdateProgress = currentIndex % 3 === 0 || currentIndex === 1 || currentIndex === vehicles.length;
      
      // Heartbeat: update every 10 seconds to show process is alive
      const shouldHeartbeat = now - lastHeartbeat > 10000;
      
      if (progressId && (shouldUpdateProgress || shouldHeartbeat)) {
        await supabase
          .from('sync_progress')
          .update({
            current_item: currentIndex,
            current_ship_name: v.name,
            current_ship_slug: v.slug,
            success_count: successCount,
            failed_count: failedCount,
            skipped_count: skippedCount,
            updated_at: new Date().toISOString(),
            metadata: {
              auto_sync,
              force,
              source: auto_sync ? 'cron' : 'admin_panel',
              upserts,
              errors,
              heartbeat: new Date().toISOString()
            }
          })
          .eq('id', progressId);
        
        if (shouldHeartbeat) {
          lastHeartbeat = now;
        }
      }
      
      // Check if aborted
      if (abortController.signal.aborted) {
        throw new Error('Sync aborted due to global timeout');
      }
      
      // Circuit breaker: stop if too many consecutive errors
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[${FUNCTION_NAME}] 🚨 CIRCUIT BREAKER TRIGGERED: ${consecutiveErrors} consecutive errors`);
        throw new Error(`Circuit breaker triggered after ${consecutiveErrors} consecutive errors`);
      }
      
      // Wrap entire ship processing in try/catch to skip errors
      try {
        // Create hash excluding volatile fields (images) to detect real data changes
        const toHash = { ...v } as any;
        delete toHash.image_url;
        delete toHash.model_glb_url;
        
        const newHash = await sha256(stableStringify(toHash));
        
        // Check if ship exists and if hash changed
        const { data: existingShip } = await supabase
          .from('ships')
          .select('hash, image_url, model_glb_url, production_status, flight_ready_since')
          .eq('slug', v.slug)
          .maybeSingle();
        
        // Check if FleetYards data changed
        const hasFleetYardsData = !!v.raw_fleetyards_data;
        const fleetYardsDataChanged = hasFleetYardsData && (
          !existingShip || 
          !(existingShip as any).fleetyards_slug_used || 
          (existingShip as any).fleetyards_slug_used !== (v as any).fleetyards_slug_used
        );
        
        // Only update if forced, hash changed, FleetYards data changed, or images are missing/different
        const hashChanged = force || !existingShip || existingShip.hash !== newHash || fleetYardsDataChanged;
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

          // Detect if ship became flight ready
          const isFlightReady = v.production_status && (
            v.production_status.toLowerCase().includes('flight ready') ||
            v.production_status.toLowerCase().includes('released') ||
            v.production_status.toLowerCase().includes('flyable')
          );
          
          const wasFlightReady = existingShip?.production_status && (
            existingShip.production_status.toLowerCase().includes('flight ready') ||
            existingShip.production_status.toLowerCase().includes('released') ||
            existingShip.production_status.toLowerCase().includes('flyable')
          );
          
          // If ship just became flight ready, record the timestamp
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
            source,
            hash: newHash,
            updated_at: new Date().toISOString(),
            raw_wiki_data: v.raw_wiki_data,
            raw_fleetyards_data: v.raw_fleetyards_data,
            fleetyards_slug_used: (v as any).fleetyards_slug_used,
            fleetyards_images: (v as any).fleetyards_images || [],
            fleetyards_videos: (v as any).fleetyards_videos || [],
            fleetyards_loaners: (v as any).fleetyards_loaners || [],
            fleetyards_variants: (v as any).fleetyards_variants || [],
            fleetyards_modules: (v as any).fleetyards_modules || [],
            fleetyards_snub_crafts: (v as any).fleetyards_snub_crafts || [],
            fleetyards_full_data: (v as any).fleetyards_full_data || null,
            data_sources: {
              wiki: { 
                has_data: !!v.raw_wiki_data, 
                last_fetch: new Date().toISOString() 
              },
              fleetyards: { 
                has_data: !!v.raw_fleetyards_data, 
                last_fetch: v.raw_fleetyards_data ? new Date().toISOString() : null 
              },
              starcitizen_api: { 
                has_data: false, 
                last_fetch: null 
              }
            }
          };
          
          // Set flight_ready_since if ship just became flight ready, otherwise keep existing value
          if (becameFlightReady) {
            payload.flight_ready_since = new Date().toISOString();
            console.log(`🚀 ${v.slug} just became FLIGHT READY!`);
          } else if (existingShip?.flight_ready_since) {
            payload.flight_ready_since = existingShip.flight_ready_since;
          }

          // Avoid overwriting existing image/model with null/undefined
          if (hasNewImage) payload.image_url = v.image_url; else if (existingShip?.image_url) payload.image_url = existingShip.image_url;
          if (hasNewModel) payload.model_glb_url = v.model_glb_url; else if (existingShip?.model_glb_url) payload.model_glb_url = existingShip.model_glb_url;

          const { error: upsertError } = await supabase.from('ships').upsert(payload, { onConflict: 'slug' });

          if (upsertError) {
            console.error(`❌ Error upserting ${v.slug}:`, JSON.stringify(upsertError));
            errors++;
            failedCount++;
            failedShips.push({
              slug: v.slug,
              name: v.name,
              error: `Upsert failed: ${upsertError.message}`
            });
            
            // Update slug validation status to 'failed'
            if ((v as any).fleetyards_slug_used) {
              await supabase
                .from('ship_slug_mappings')
                .upsert({
                  wiki_title: v.name,
                  fleetyards_slug: (v as any).fleetyards_slug_used,
                  validation_status: 'failed',
                  last_validation_error: upsertError.message,
                  last_validated_at: new Date().toISOString(),
                  validation_attempts: (await supabase
                    .from('ship_slug_mappings')
                    .select('validation_attempts')
                    .eq('wiki_title', v.name)
                    .maybeSingle()
                  ).data?.validation_attempts + 1 || 1
                }, {
                  onConflict: 'wiki_title'
                });
            }
          } else {
            upserts++;
            successCount++;
            consecutiveErrors = 0; // Reset circuit breaker on success
            
            // Update slug validation status to 'validated'
            if ((v as any).fleetyards_slug_used) {
              await supabase
                .from('ship_slug_mappings')
                .upsert({
                  wiki_title: v.name,
                  fleetyards_slug: (v as any).fleetyards_slug_used,
                  validation_status: 'validated',
                  last_validation_error: null,
                  last_validated_at: new Date().toISOString(),
                  validation_attempts: (await supabase
                    .from('ship_slug_mappings')
                    .select('validation_attempts')
                    .eq('wiki_title', v.name)
                    .maybeSingle()
                  ).data?.validation_attempts + 1 || 1
                }, {
                  onConflict: 'wiki_title'
                });
            }
            
            if (existingShip) {
              console.log(`✅ Updated ${v.slug} (hash: ${hashChanged}, img: ${imageChanged}, model: ${modelChanged}, FY: ${hasFleetYardsData}, FY_slug: ${(v as any).fleetyards_slug_used || 'none'})`);
            } else {
              console.log(`✅ Created new ship: ${v.slug} (FY: ${hasFleetYardsData}, FY_slug: ${(v as any).fleetyards_slug_used || 'none'})`);
            }
          }
        } else {
          console.log(`Skipped ${v.slug} - no changes detected`);
          skippedCount++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ CRITICAL ERROR processing vehicle ${v.slug}:`, errorMsg);
        errors++;
        failedCount++;
        consecutiveErrors++; // Increment circuit breaker counter
        
        failedShips.push({
          slug: v.slug,
          name: v.name,
          error: errorMsg
        });
        
        // Update slug validation status to 'failed' with error
        if ((v as any).fleetyards_slug_used) {
          try {
            await supabase
              .from('ship_slug_mappings')
              .upsert({
                wiki_title: v.name,
                fleetyards_slug: (v as any).fleetyards_slug_used,
                validation_status: 'failed',
                last_validation_error: errorMsg,
                last_validated_at: new Date().toISOString(),
                validation_attempts: (await supabase
                  .from('ship_slug_mappings')
                  .select('validation_attempts')
                  .eq('wiki_title', v.name)
                  .maybeSingle()
                ).data?.validation_attempts + 1 || 1
              }, {
                onConflict: 'wiki_title'
              });
          } catch (mappingError) {
            console.error(`Failed to update slug mapping for ${v.name}:`, mappingError);
          }
        }
        
        // IMPORTANT: Continue with next ship instead of crashing
        console.log(`⏭️ Skipping ${v.slug} and continuing with next ship...`);
        continue;
      }
    }

    // Check API failure rate and alert if critical
    const apiFailureRate = vehicles.length > 0 ? (sourceCounts.api_failures / vehicles.length) * 100 : 0;
    
    if (apiFailureRate > 50) {
      console.error(`⚠️ CRITICAL ALERT: ${apiFailureRate.toFixed(1)}% of ships failed to fetch from APIs!`);
      
      // Log alert in audit_logs
      await supabase.from('audit_logs').insert({
        action: 'api_failure_alert',
        target: 'ships_sync',
        meta: {
          failure_rate: apiFailureRate,
          total_failures: sourceCounts.api_failures,
          total_vehicles: vehicles.length,
          source_counts: sourceCounts,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Refresh materialized view
    try {
      await supabase.rpc('refresh_active_users_30d');
    } catch (err) {
      console.error('Error refreshing active_users_30d view:', err);
    }

    // Log to audit with detailed counts
    await supabase.from('audit_logs').insert({
      action: auto_sync ? 'auto_sync_ships' : 'manual_sync_ships',
      target: 'ships',
      meta: {
        source: auto_sync ? 'cron' : 'admin_panel',
        total_vehicles: vehicles.length,
        upserts,
        errors,
        success_count: successCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        failed_ships: failedShips.slice(0, 20), // Limit to first 20 failures
        data_sources: sourceCounts,
        api_failure_rate: apiFailureRate,
        timestamp: new Date().toISOString(),
        force
      }
    });

    // Update sync progress to completed with detailed counts
    if (progressId) {
      await supabase
        .from('sync_progress')
        .update({
          status: 'completed',
          current_item: vehicles.length,
          success_count: successCount,
          failed_count: failedCount,
          skipped_count: skippedCount,
          failed_ships: failedShips.slice(0, 50), // Store up to 50 failures
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          metadata: {
            auto_sync,
            force,
            source: auto_sync ? 'cron' : 'admin_panel',
            upserts,
            errors,
            data_sources: sourceCounts,
            api_failure_rate: apiFailureRate
          }
        })
        .eq('id', progressId);
    }
    
    // Update job history to success
    if (jobHistoryId) {
      await supabase
        .from('cron_job_history')
        .update({
          status: 'success',
          items_synced: upserts,
          duration_ms: Date.now() - startTime
        })
        .eq('id', jobHistoryId);
    }

    // Release lock
    try {
      await supabase.rpc('release_function_lock', {
        p_function_name: FUNCTION_NAME
      });
      console.log(`[${FUNCTION_NAME}] Lock released`);
    } catch (unlockError) {
      console.error(`[${FUNCTION_NAME}] Error releasing lock:`, unlockError);
    }

    console.log(`[${FUNCTION_NAME}] 🎉 Sync completed successfully!`);
    console.log(`  ✅ Success: ${successCount} ships`);
    console.log(`  ❌ Failed: ${failedCount} ships`);
    console.log(`  ⏭️ Skipped: ${skippedCount} ships (no changes)`);
    console.log(`  📊 Total processed: ${vehicles.length} ships`);
    console.log(`  ⏱️ Duration: ${((Date.now() - startTime) / 1000 / 60).toFixed(2)} minutes`);
    
    if (failedShips.length > 0) {
      console.log(`\n⚠️ Failed ships (first 10):`);
      failedShips.slice(0, 10).forEach(ship => {
        console.log(`  - ${ship.name} (${ship.slug}): ${ship.error}`);
      });
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
        upserts, 
        errors,
        total: vehicles.length,
        failedShips: failedShips.slice(0, 10),
        duration_ms: Date.now() - startTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${FUNCTION_NAME}] Fatal error:`, error);
    
    // Update sync progress to failed
    if (progressId) {
      await supabase
        .from('sync_progress')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('id', progressId);
    }
    
    // Update job history to failed
    if (jobHistoryId) {
      await supabase
        .from('cron_job_history')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: Date.now() - startTime
        })
        .eq('id', jobHistoryId);
    }
    
    // Release lock even on error
    try {
      await supabase.rpc('release_function_lock', {
        p_function_name: FUNCTION_NAME
      });
      console.log(`[${FUNCTION_NAME}] Lock released after error`);
    } catch (unlockError) {
      console.error(`[${FUNCTION_NAME}] Error releasing lock after fatal error:`, unlockError);
    }
    
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
  } finally {
    // ALWAYS clear timeout and release lock
    clearTimeout(globalTimeout);
    
    if (lockAcquired) {
      try {
        await supabase.rpc('release_function_lock', {
          p_function_name: FUNCTION_NAME
        });
        console.log(`[${FUNCTION_NAME}] Lock released in finally block`);
      } catch (finallyError) {
        console.error(`[${FUNCTION_NAME}] Error in finally block:`, finallyError);
      }
    }
  }
});
