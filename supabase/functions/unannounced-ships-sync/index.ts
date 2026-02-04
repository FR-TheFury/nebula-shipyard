import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FUNCTION_NAME = 'unannounced-ships-sync';

// Development stage mapping for progress percentage (NO flight_ready - those are not rumors!)
const STAGE_PROGRESS: Record<string, number> = {
  'concepting': 10,
  'early_concept': 15,
  'whitebox': 35,
  'greybox': 60,
  'final_review': 85
};

// Patterns to detect unannounced ships in monthly reports
const UNANNOUNCED_PATTERNS = [
  /(\d+)\s*(?:st|nd|rd|th)?\s*unannounced\s*vehicle/gi,
  /unannounced\s*vehicle\s*(?:#?\s*)?(\d+)/gi,
  /(?:first|second|third|fourth|fifth)\s*unannounced\s*vehicle/gi,
  /new\s+unannounced\s+(?:ship|vehicle)/gi,
];

// Patterns to extract development stage
const STAGE_PATTERNS = [
  { pattern: /final\s*(?:art\s*)?review/gi, stage: 'final_review' },
  { pattern: /greybox(?:\s*review)?/gi, stage: 'greybox' },
  { pattern: /whitebox(?:\s*review)?/gi, stage: 'whitebox' },
  { pattern: /early\s*concept/gi, stage: 'early_concept' },
  { pattern: /concepting/gi, stage: 'concepting' },
];

// Ship-specific patterns (for named ships in development)
const NAMED_SHIP_PATTERNS = [
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:in\s+)?(?:whitebox|greybox|final\s*review)/gi,
  /([A-Z][A-Z0-9\-]+(?:\s+[A-Z][a-z]+)?)\s+(?:whitebox|greybox)/gi,
];

interface RumorData {
  codename: string;
  possible_name?: string;
  possible_manufacturer?: string;
  development_stage?: string;
  source_type: string;
  source_url?: string;
  source_date?: string;
  evidence: { source: string; date: string; excerpt: string }[];
  notes?: string;
}

// Fetch RSI Monthly Reports via Comm-Links API
async function fetchRSIMonthlyReports(): Promise<RumorData[]> {
  console.log('📰 Fetching RSI Monthly Reports...');
  const rumors: RumorData[] = [];
  
  try {
    // RSI Comm-Links API for monthly reports
    const response = await fetch('https://robertsspaceindustries.com/api/hub/getCommlinkItems', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'transmission',
        series: 'monthly-report',
        sort: 'publish_new',
        page: 1,
        pagesize: 12
      })
    });
    
    if (!response.ok) {
      console.log(`⚠️ RSI API returned ${response.status}`);
      return rumors;
    }
    
    const data = await response.json();
    const articles = data?.data || [];
    
    console.log(`   Found ${articles.length} monthly reports`);
    
    for (const article of articles.slice(0, 6)) {
      const title = article.title || '';
      const excerpt = article.excerpt || '';
      const url = `https://robertsspaceindustries.com${article.url || ''}`;
      const publishDate = article.publish_start || new Date().toISOString();
      
      // Check for unannounced vehicles
      const combinedText = `${title} ${excerpt}`;
      
      for (const pattern of UNANNOUNCED_PATTERNS) {
        const matches = combinedText.matchAll(pattern);
        for (const match of matches) {
          const vehicleNumber = match[1] || 'Unknown';
          const codename = `Unannounced Vehicle #${vehicleNumber}`;
          
          // Try to find development stage
          let stage = 'concepting';
          for (const { pattern: stagePattern, stage: stageName } of STAGE_PATTERNS) {
            if (stagePattern.test(combinedText)) {
              stage = stageName;
              break;
            }
          }
          
          rumors.push({
            codename,
            development_stage: stage,
            source_type: 'monthly_report',
            source_url: url,
            source_date: publishDate,
            evidence: [{
              source: url,
              date: publishDate,
              excerpt: excerpt.substring(0, 500)
            }]
          });
        }
      }
      
      // Check for named ships in development
      for (const pattern of NAMED_SHIP_PATTERNS) {
        const matches = combinedText.matchAll(pattern);
        for (const match of matches) {
          const shipName = match[1]?.trim();
          if (shipName && shipName.length > 2 && shipName.length < 50) {
            let stage = 'concepting';
            for (const { pattern: stagePattern, stage: stageName } of STAGE_PATTERNS) {
              if (stagePattern.test(combinedText)) {
                stage = stageName;
                break;
              }
            }
            
            rumors.push({
              codename: shipName,
              possible_name: shipName,
              development_stage: stage,
              source_type: 'monthly_report',
              source_url: url,
              source_date: publishDate,
              evidence: [{
                source: url,
                date: publishDate,
                excerpt: excerpt.substring(0, 500)
              }]
            });
          }
        }
      }
    }
    
    console.log(`   Extracted ${rumors.length} rumors from monthly reports`);
  } catch (error) {
    console.error('Error fetching RSI reports:', error);
  }
  
  return rumors;
}

// Fetch SCUnpacked data from GitHub
async function fetchSCUnpackedData(): Promise<RumorData[]> {
  console.log('📦 Fetching SCUnpacked data...');
  const rumors: RumorData[] = [];
  
  try {
    // Main ships manifest
    const shipsUrl = 'https://raw.githubusercontent.com/StarCitizenWiki/scunpacked/main/api/ships.json';
    const response = await fetch(shipsUrl);
    
    if (!response.ok) {
      console.log(`⚠️ SCUnpacked returned ${response.status}`);
      return rumors;
    }
    
    const ships = await response.json();
    console.log(`   Found ${Object.keys(ships).length} ships in SCUnpacked`);
    
    // We'll compare with our existing ships later
    // For now, just log what we found
  } catch (error) {
    console.error('Error fetching SCUnpacked:', error);
  }
  
  return rumors;
}

// Fetch FleetYards ships in concept/production (EXCLUDE flight-ready!)
async function fetchFleetYardsInDevelopment(): Promise<RumorData[]> {
  console.log('🚀 Fetching FleetYards in-development ships...');
  const rumors: RumorData[] = [];
  
  try {
    // Get ships with in-concept or in-production status ONLY (not flight-ready)
    const statuses = ['in-concept', 'in-production'];
    
    for (const status of statuses) {
      const url = `https://api.fleetyards.net/v1/models?page=1&perPage=100&productionStatus=${status}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) continue;
      
      const ships = await response.json();
      console.log(`   Found ${ships.length} ships with status: ${status}`);
      
      for (const ship of ships) {
        // Skip any ship that is flight-ready (double check)
        if (ship.productionStatus === 'flight-ready') {
          console.log(`   ⏭️ Skipping flight-ready ship: ${ship.name}`);
          continue;
        }
        
        // Map FleetYards production status to our stage
        let stage = 'concepting';
        if (status === 'in-production') {
          stage = 'greybox';
        }
        
        rumors.push({
          codename: ship.name,
          possible_name: ship.name,
          possible_manufacturer: ship.manufacturer?.name,
          development_stage: stage,
          source_type: 'roadmap',
          source_url: `https://fleetyards.net/ships/${ship.slug}`,
          source_date: new Date().toISOString(),
          evidence: [{
            source: `https://api.fleetyards.net/v1/models/${ship.slug}`,
            date: new Date().toISOString(),
            excerpt: `Production status: ${ship.productionStatus || status}`
          }],
          notes: `From FleetYards API - ${ship.focus || 'Unknown role'}`
        });
      }
    }
  } catch (error) {
    console.error('Error fetching FleetYards:', error);
  }
  
  console.log(`   Total: ${rumors.length} in-development ships from FleetYards`);
  return rumors;
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    console.log('========================================');
    console.log('🔍 UNANNOUNCED SHIPS SYNC STARTED');
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('========================================');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch from all sources in parallel
    const [rsiRumors, scUnpackedRumors, fyRumors] = await Promise.all([
      fetchRSIMonthlyReports(),
      fetchSCUnpackedData(),
      fetchFleetYardsInDevelopment()
    ]);
    
    // Combine all rumors
    const allRumors = [...rsiRumors, ...scUnpackedRumors, ...fyRumors];
    console.log(`\n📊 Total rumors collected: ${allRumors.length}`);
    
    // Get existing ships to filter out announced ones
    const { data: existingShips } = await supabase
      .from('ships')
      .select('name, slug, production_status')
      .order('name');
    
    const existingNames = new Set(
      (existingShips || []).map(s => s.name.toLowerCase())
    );
    const existingSlugs = new Set(
      (existingShips || []).map(s => s.slug.toLowerCase())
    );
    
    // Filter out rumors for ships that are already in our database
    const newRumors = allRumors.filter(rumor => {
      const name = (rumor.possible_name || rumor.codename).toLowerCase();
      const slug = name.replace(/\s+/g, '-');
      return !existingNames.has(name) && !existingSlugs.has(slug);
    });
    
    console.log(`   After filtering: ${newRumors.length} new rumors`);
    
    // Get existing rumors to update
    const { data: existingRumors } = await supabase
      .from('ship_rumors')
      .select('id, codename, evidence')
      .eq('is_active', true);
    
    const existingRumorMap = new Map(
      (existingRumors || []).map(r => [r.codename.toLowerCase(), r])
    );
    
    let inserted = 0;
    let updated = 0;
    
    for (const rumor of newRumors) {
      const key = rumor.codename.toLowerCase();
      const existing = existingRumorMap.get(key);
      
      if (existing) {
        // Update existing rumor with new evidence
        const newEvidence = [
          ...(existing.evidence as any[] || []),
          ...rumor.evidence
        ].slice(-10); // Keep last 10 evidence items
        
        const { error } = await supabase
          .from('ship_rumors')
          .update({
            development_stage: rumor.development_stage,
            evidence: newEvidence,
            source_date: rumor.source_date,
            notes: rumor.notes
          })
          .eq('id', existing.id);
        
        if (!error) updated++;
      } else {
        // Insert new rumor
        const { error } = await supabase
          .from('ship_rumors')
          .insert({
            codename: rumor.codename,
            possible_name: rumor.possible_name,
            possible_manufacturer: rumor.possible_manufacturer,
            development_stage: rumor.development_stage,
            source_type: rumor.source_type,
            source_url: rumor.source_url,
            source_date: rumor.source_date,
            evidence: rumor.evidence,
            notes: rumor.notes,
            is_active: true
          });
        
        if (!error) inserted++;
      }
    }
    
    const duration = Date.now() - startTime;
    
    console.log('\n========================================');
    console.log('✅ SYNC COMPLETED');
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Updated: ${updated}`);
    console.log('========================================');
    
    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        stats: {
          total_collected: allRumors.length,
          after_filtering: newRumors.length,
          inserted,
          updated
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
