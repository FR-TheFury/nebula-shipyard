import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsItem {
  title: string;
  excerpt?: string;
  content_md?: string;
  category: string;
  image_url?: string;
  source_url: string;
  published_at: string;
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

async function fetchCommLinksFromWiki(): Promise<string[]> {
  try {
    // Fetch comm-links from multiple relevant categories
    const categories = [
      'Category:News_Update',
      'Category:Monthly_Reports', 
      'Category:Spectrum_Dispatch',
      'Category:This_Week_in_Star_Citizen'
    ];
    
    const allTitles: string[] = [];
    
    for (const category of categories) {
      try {
        const url = `https://starcitizen.tools/api.php?action=query&list=categorymembers&cmtitle=${category}&cmlimit=50&cmnamespace=0&cmsort=timestamp&cmdir=desc&format=json`;
        console.log(`Fetching from ${category}...`);
        
        const res = await fetch(url);
        if (!res.ok) continue;
        
        const data = await res.json();
        
        if (data?.query?.categorymembers) {
          for (const member of data.query.categorymembers) {
            if (member.title && !member.title.includes(':') && !member.title.includes('/')) {
              allTitles.push(member.title);
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch ${category}:`, err);
      }
    }
    
    // Remove duplicates and limit to most recent 20
    const uniqueTitles = [...new Set(allTitles)].slice(0, 20);
    console.log(`Found ${uniqueTitles.length} unique comm-links`);
    return uniqueTitles;
  } catch (error) {
    console.error('Error fetching comm-link titles:', error);
    return [];
  }
}

async function fetchCommLinkData(title: string): Promise<any> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'revisions|pageimages|info|categories',
      rvprop: 'content|timestamp',
      rvslots: 'main',
      piprop: 'thumbnail|original',
      pithumbsize: '800',
      inprop: 'url',
      format: 'json'
    });
    
    const url = `https://starcitizen.tools/api.php?${params}`;
    const res = await fetch(url);
    
    if (!res.ok) return null;
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error(`Error fetching data for ${title}:`, error);
    return null;
  }
}

function parseCommLinkContent(wikitext: string): { excerpt?: string; category: string } {
  // Extract first paragraph as excerpt
  const paragraphs = wikitext.split('\n\n').filter(p => 
    p.trim().length > 20 && 
    !p.startsWith('[[') && 
    !p.startsWith('{{') &&
    !p.startsWith('==') &&
    !p.startsWith('*') &&
    !p.startsWith('#')
  );
  
  let excerpt = paragraphs[0]?.substring(0, 300);
  if (excerpt && excerpt.length === 300) {
    excerpt += '...';
  }
  
  // Try to extract category from wikitext
  const categoryMatch = wikitext.match(/\[\[Category:([^\]|]+)/i);
  const category = categoryMatch ? categoryMatch[1].replace(/_/g, ' ') : 'Community';
  
  return { excerpt, category };
}

async function fetchRSINews(): Promise<NewsItem[]> {
  try {
    console.log('🚀 Starting news sync from Star Citizen Wiki...');
    
    // Step 1: Get comm-link titles
    const commLinkTitles = await fetchCommLinksFromWiki();
    
    if (commLinkTitles.length === 0) {
      console.log('No comm-links found');
      return [];
    }
    
    console.log(`Processing ${commLinkTitles.length} comm-links...`);
    
    const newsItems: NewsItem[] = [];
    
    // Step 2: Fetch detailed data for each comm-link
    for (const title of commLinkTitles) {
      try {
        const wikiData = await fetchCommLinkData(title);
        
        if (!wikiData?.query?.pages) {
          console.log(`⚠️ No data for ${title}`);
          continue;
        }
        
        const page = Object.values(wikiData.query.pages)[0] as any;
        
        if (!page || page.missing) {
          console.log(`⚠️ Page missing: ${title}`);
          continue;
        }
        
        // Extract wikitext content
        const wikitext = page.revisions?.[0]?.slots?.main?.['*'] || '';
        const timestamp = page.revisions?.[0]?.timestamp || new Date().toISOString();
        
        // Parse content
        const parsed = parseCommLinkContent(wikitext);
        
        // Get image URL
        let image_url: string | undefined;
        if (page.thumbnail?.source) {
          image_url = page.thumbnail.source;
        } else if (page.original?.source) {
          image_url = page.original.source;
        }
        
        const newsItem: NewsItem = {
          title,
          excerpt: parsed.excerpt,
          content_md: parsed.excerpt, // Can be enhanced later to convert full wikitext to markdown
          category: parsed.category,
          image_url,
          source_url: page.fullurl || `https://starcitizen.tools/${encodeURIComponent(title.replace(/ /g, '_'))}`,
          published_at: timestamp
        };
        
        newsItems.push(newsItem);
        
        if (newsItems.length % 5 === 0) {
          console.log(`Processed ${newsItems.length}/${commLinkTitles.length} comm-links...`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        console.error(`Error processing ${title}:`, err);
      }
    }
    
    console.log(`✅ Successfully processed ${newsItems.length} comm-links`);
    return newsItems;
  } catch (error) {
    console.error('Error fetching comm-links from Wiki:', error);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting news sync...');
    const newsItems = await fetchRSINews();
    console.log(`Fetched ${newsItems.length} comm-links from Wiki`);
    
    let upserts = 0;
    let errors = 0;

    for (const item of newsItems) {
      try {
        const toHash = { ...item };
        delete (toHash as any).image_url; // Image URLs are volatile
        
        const hash = await sha256(stableStringify(toHash));
        const source = {
          source: 'rsi',
          url: item.source_url,
          ts: new Date().toISOString()
        };

        const { error } = await supabase.from('news').upsert({
          title: item.title,
          excerpt: item.excerpt,
          content_md: item.content_md,
          category: item.category,
          image_url: item.image_url,
          source_url: item.source_url,
          published_at: item.published_at,
          source,
          hash,
          updated_at: new Date().toISOString()
        }, { onConflict: 'hash' });

        if (error) {
          console.error(`Error upserting news "${item.title}":`, error);
          errors++;
        } else {
          upserts++;
        }
      } catch (err) {
        console.error(`Error processing news "${item.title}":`, err);
        errors++;
      }
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      action: 'news_sync',
      target: 'news',
      meta: {
        total_items: newsItems.length,
        upserts,
        errors,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`News sync completed: ${upserts} upserts, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        upserts, 
        errors,
        total: newsItems.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fatal error in news-sync:', error);
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
