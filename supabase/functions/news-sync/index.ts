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

async function fetchCommLinksFromRSI(): Promise<any[]> {
  try {
    console.log('🚀 Fetching comm-links from RSI GraphQL API...');
    
    // RSI uses a GraphQL API to fetch comm-links
    const query = `
      query {
        allCommLinks(limit: 20, sort: "-published_at") {
          id
          title
          slug
          url
          excerpt
          body
          category {
            name
          }
          channel {
            name
          }
          images {
            url
          }
          published_at
        }
      }
    `;
    
    const res = await fetch('https://robertsspaceindustries.com/api/hub/v1/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ query })
    });
    
    if (!res.ok) {
      console.error(`RSI API returned status ${res.status}`);
      return [];
    }
    
    const data = await res.json();
    
    if (data.data?.allCommLinks) {
      console.log(`✅ Found ${data.data.allCommLinks.length} comm-links from RSI`);
      return data.data.allCommLinks;
    }
    
    console.warn('No comm-links found in response');
    return [];
  } catch (error) {
    console.error('Error fetching comm-links from RSI GraphQL:', error);
    return [];
  }
}

async function fetchRSINews(): Promise<NewsItem[]> {
  try {
    console.log('🚀 Starting news sync from RSI official API...');
    
    // Get comm-links from RSI GraphQL API
    const commLinks = await fetchCommLinksFromRSI();
    
    if (commLinks.length === 0) {
      console.log('No comm-links found from RSI');
      return [];
    }
    
    console.log(`Processing ${commLinks.length} comm-links from RSI...`);
    
    const newsItems: NewsItem[] = [];
    
    // Transform RSI data into our NewsItem format
    for (const commLink of commLinks) {
      try {
        // Get category from category or channel
        let category = 'Community';
        if (commLink.category?.name) {
          category = commLink.category.name;
        } else if (commLink.channel?.name) {
          category = commLink.channel.name;
        }
        
        // Get image URL
        let image_url: string | undefined;
        if (commLink.images && commLink.images.length > 0) {
          image_url = commLink.images[0].url;
          // Ensure full URL
          if (image_url && !image_url.startsWith('http')) {
            image_url = `https://robertsspaceindustries.com${image_url}`;
          }
        }
        
        // Construct full URL
        let source_url = commLink.url || '';
        if (source_url && !source_url.startsWith('http')) {
          source_url = `https://robertsspaceindustries.com${source_url}`;
        }
        
        const newsItem: NewsItem = {
          title: commLink.title,
          excerpt: commLink.excerpt,
          content_md: commLink.body, // Full body content
          category,
          image_url,
          source_url,
          published_at: commLink.published_at || new Date().toISOString()
        };
        
        newsItems.push(newsItem);
        
        if (newsItems.length % 5 === 0) {
          console.log(`Processed ${newsItems.length}/${commLinks.length} comm-links...`);
        }
        
      } catch (err) {
        console.error(`Error processing comm-link "${commLink.title}":`, err);
      }
    }
    
    console.log(`✅ Successfully processed ${newsItems.length} comm-links from RSI`);
    return newsItems;
  } catch (error) {
    console.error('Error fetching comm-links from RSI:', error);
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
    console.log(`Fetched ${newsItems.length} comm-links from RSI official API`);
    
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
