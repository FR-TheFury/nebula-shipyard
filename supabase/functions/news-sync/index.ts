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

async function fetchRSINews(): Promise<NewsItem[]> {
  try {
    // Use RSI GraphQL API for more reliable data
    const graphqlUrl = 'https://robertsspaceindustries.com/graphql';
    console.log('Fetching news from RSI GraphQL API');
    
    const query = `
      query {
        articles(limit: 20, sort: "publish_new") {
          id
          title
          excerpt
          url
          images {
            url
          }
          category {
            name
          }
          publish_new
        }
      }
    `;
    
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
      },
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      console.log('GraphQL API failed, falling back to Wiki API');
      // Fallback to Star Citizen Wiki
      return await fetchWikiNews();
    }
    
    const data = await response.json();
    console.log('GraphQL response received');
    
    if (!data.data?.articles) {
      console.log('No articles in GraphQL response, using fallback');
      return await fetchWikiNews();
    }
    
    const items: NewsItem[] = data.data.articles.map((article: any) => {
      const category = article.category?.name || 'Community';
      return {
        title: article.title,
        excerpt: article.excerpt || undefined,
        content_md: article.excerpt || undefined,
        category: category,
        image_url: article.images?.[0]?.url || undefined,
        source_url: article.url.startsWith('http') ? article.url : `https://robertsspaceindustries.com${article.url}`,
        published_at: article.publish_new || new Date().toISOString()
      };
    });
    
    console.log(`Fetched ${items.length} news items from GraphQL`);
    return items;
  } catch (error) {
    console.error('Error fetching RSI news:', error);
    // Try fallback
    return await fetchWikiNews();
  }
}

async function fetchWikiNews(): Promise<NewsItem[]> {
  try {
    console.log('Fetching news from Star Citizen Wiki');
    const endpoints = [
      'https://api.star-citizen.wiki/api/v3/comm-links?limit=20&sort=-date',
      'https://api.star-citizen.wiki/api/v3/news?limit=20'
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) continue;
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data : [];
        if (list.length === 0) continue;

        const items: NewsItem[] = list.map((item: any) => {
          const a = item?.attributes || item || {};
          return {
            title: a.title || a.name || 'Untitled',
            excerpt: a.excerpt || a.description || undefined,
            content_md: a.content || a.body || a.excerpt || undefined,
            category: a.category || 'Community',
            image_url: a.image_url || a.image?.source_url || a.thumbnail || undefined,
            source_url: a.url || (a.slug ? `https://starcitizen.tools/${a.slug}` : 'https://starcitizen.tools'),
            published_at: a.date || a.published_at || new Date().toISOString(),
          } as NewsItem;
        });

        console.log(`Fetched ${items.length} news items from Wiki (${url})`);
        return items;
      } catch (innerErr) {
        console.warn(`Wiki endpoint failed ${url}:`, innerErr);
      }
    }

    console.log('Wiki API returned no data field or empty list');
    return [];
  } catch (error) {
    console.error('Error fetching Wiki news:', error);
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
    console.log(`Fetched ${newsItems.length} news items from RSI`);
    
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
