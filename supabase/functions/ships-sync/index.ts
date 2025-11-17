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
  systems?: unknown;
  prices?: unknown;
  patch?: string;
  production_status?: string;
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

// Fetch ship hardpoints from FleetYards.net API
async function fetchShipHardpointsFromFleetYards(slug: string): Promise<any> {
  try {
    console.log(`  Fetching data from FleetYards API for ${slug}...`);
    
    // FleetYards uses lowercase slugs with hyphens
    const fleetYardsSlug = slug.toLowerCase();
    
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
    
    // Process each hardpoint
    for (const hp of hardpoints) {
      const componentName = hp.component?.name || hp.name || 'Unknown';
      const size = hp.size ? `S${hp.size}` : '';
      const itemName = size ? `${size} ${componentName}` : componentName;
      
      // Map by category and type
      switch (hp.category?.toLowerCase()) {
        case 'weapons':
          if (hp.type?.toLowerCase().includes('turret')) {
            mappedData.armament.turrets.push(itemName);
          } else if (hp.type?.toLowerCase().includes('missile')) {
            mappedData.armament.missiles.push(itemName);
          } else {
            mappedData.armament.weapons.push(itemName);
          }
          break;
          
        case 'turrets':
          mappedData.armament.turrets.push(itemName);
          break;
          
        case 'missiles':
          mappedData.armament.missiles.push(itemName);
          break;
          
        case 'utility':
          mappedData.armament.utility.push(itemName);
          break;
          
        case 'systems':
          // Map by component class
          const componentClass = hp.component?.component_class?.toLowerCase();
          
          if (componentClass?.includes('power_plant')) {
            mappedData.systems.power.power_plants.push(itemName);
          } else if (componentClass?.includes('shield')) {
            mappedData.systems.power.shield_generators.push(itemName);
          } else if (componentClass?.includes('cooler')) {
            mappedData.systems.power.coolers.push(itemName);
          } else if (componentClass?.includes('quantum')) {
            mappedData.systems.propulsion.quantum_drives.push(itemName);
          } else if (componentClass?.includes('radar')) {
            mappedData.systems.avionics.radar.push(itemName);
          } else if (componentClass?.includes('computer')) {
            mappedData.systems.avionics.computer.push(itemName);
          } else if (componentClass?.includes('scanner')) {
            mappedData.systems.avionics.scanner.push(itemName);
          } else if (componentClass?.includes('fuel_intake')) {
            mappedData.systems.propulsion.fuel_intakes.push(itemName);
          } else if (componentClass?.includes('fuel_tank')) {
            mappedData.systems.propulsion.fuel_tanks.push(itemName);
          } else if (hp.type?.toLowerCase().includes('thruster')) {
            if (hp.name?.toLowerCase().includes('main')) {
              mappedData.systems.thrusters.main.push(itemName);
            } else if (hp.name?.toLowerCase().includes('retro')) {
              mappedData.systems.thrusters.retro.push(itemName);
            } else {
              mappedData.systems.thrusters.maneuvering.push(itemName);
            }
          }
          break;
          
        case 'propulsion':
          if (componentClass?.includes('quantum')) {
            mappedData.systems.propulsion.quantum_drives.push(itemName);
          } else if (componentClass?.includes('thruster')) {
            mappedData.systems.thrusters.maneuvering.push(itemName);
          }
          break;
      }
    }
    
    return mappedData;
    
  } catch (error) {
    console.error(`  ❌ Error fetching from FleetYards for ${slug}:`, error);
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
        
        // Fetch parsed HTML to extract hardpoints from {{Vehicle hardpoints}} template
        console.log(`  Fetching hardpoints table for ${title}...`);
        const parsedHtml = await fetchParsedHtmlFromWiki(title);
        const hardpointsData = parseHardpointsFromHtml(parsedHtml || '');
        
        // Merge hardpoints data into parsed data (overwrite with HTML-extracted data)
        parsedData.armament = hardpointsData.armament;
        parsedData.systems = hardpointsData.systems;
        
        // Try to fetch from FleetYards API for more complete hardpoints data
        const fleetYardsData = await fetchShipHardpointsFromFleetYards(slug);
        
        // If FleetYards has data, use it to complement/replace Wiki data
        if (fleetYardsData) {
          // Use FleetYards data if Wiki data is empty or less detailed
          const wikiHasArmament = Object.values(parsedData.armament || {}).some((arr: any) => arr?.length > 0);
          const wikiHasSystems = Object.values(parsedData.systems || {}).some((group: any) => 
            Object.values(group || {}).some((arr: any) => arr?.length > 0)
          );
          
          if (!wikiHasArmament && fleetYardsData.armament) {
            console.log(`  ✓ Using FleetYards armament data (Wiki had none)`);
            parsedData.armament = fleetYardsData.armament;
          }
          
          if (!wikiHasSystems && fleetYardsData.systems) {
            console.log(`  ✓ Using FleetYards systems data (Wiki had none)`);
            parsedData.systems = fleetYardsData.systems;
          }
        }
        
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
          systems: parsedData.systems
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

  const FUNCTION_NAME = 'ships-sync';
  const LOCK_DURATION = 600; // 10 minutes max for this heavy function
  const startTime = Date.now();
  let jobHistoryId: number | null = null;
  let force = false;
  let auto_sync = false;
  
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
    const { data: lockAcquired, error: lockError } = await supabase
      .rpc('acquire_function_lock', {
        p_function_name: FUNCTION_NAME,
        p_lock_duration_seconds: LOCK_DURATION
      });

    if (lockError) {
      console.error(`[${FUNCTION_NAME}] Lock error:`, lockError);
      throw lockError;
    }

    if (!lockAcquired) {
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

    console.log(`[${FUNCTION_NAME}] Lock acquired. Starting ships sync... (${auto_sync ? 'AUTO' : 'MANUAL'}, force: ${force})`);
    
    // Create job history entry
    const { data: jobHistory } = await supabase
      .from('cron_job_history')
      .insert({
        job_name: FUNCTION_NAME,
        status: 'running'
      })
      .select('id')
      .single();
    
    jobHistoryId = jobHistory?.id || null;
    
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
          .select('hash, image_url, model_glb_url, production_status, flight_ready_since')
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
            systems: v.systems,
            prices: v.prices,
            patch: v.patch,
            production_status: v.production_status,
            source,
            hash: newHash,
            updated_at: new Date().toISOString()
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
      action: auto_sync ? 'auto_sync_ships' : 'manual_sync_ships',
      target: 'ships',
      meta: {
        source: auto_sync ? 'cron' : 'admin_panel',
        total_vehicles: vehicles.length,
        upserts,
        errors,
        timestamp: new Date().toISOString(),
        force
      }
    });

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

    console.log(`[${FUNCTION_NAME}] Sync completed: ${upserts} upserts, ${errors} errors (force=${force})`);

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
    console.error(`[${FUNCTION_NAME}] Fatal error:`, error);
    
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
  }
});
