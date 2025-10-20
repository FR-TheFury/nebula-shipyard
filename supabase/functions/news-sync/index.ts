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
    // Fetch RSS feed from Roberts Space Industries
    const rssUrl = 'https://robertsspaceindustries.com/comm-link/rss';
    const response = await fetch(rssUrl);
    const text = await response.text();
    
    // Parse RSS XML (simple parser)
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const matches = text.matchAll(itemRegex);
    
    for (const match of matches) {
      const itemXml = match[1];
      
      const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || 
                   itemXml.match(/<title>(.*?)<\/title>/)?.[1] || '';
      
      const description = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || 
                         itemXml.match(/<description>(.*?)<\/description>/)?.[1] || '';
      
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || '';
      
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      
      // Extract category from title or content
      let category = 'Community';
      if (title.toLowerCase().includes('patch') || title.toLowerCase().includes('update')) {
        category = 'Update';
      } else if (title.toLowerCase().includes('sale') || title.toLowerCase().includes('concept')) {
        category = 'Sale';
      } else if (title.toLowerCase().includes('event') || title.toLowerCase().includes('weekend')) {
        category = 'Event';
      } else if (title.toLowerCase().includes('tech') || title.toLowerCase().includes('performance')) {
        category = 'Tech';
      } else if (description.toLowerCase().includes('feature') || title.toLowerCase().includes('new')) {
        category = 'Feature';
      }
      
      // Extract image from description if available
      const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);
      const image_url = imgMatch ? imgMatch[1] : undefined;
      
      // Clean excerpt (remove HTML tags)
      const excerpt = description.replace(/<[^>]*>/g, '').substring(0, 200);
      
      if (title && link && pubDate) {
        items.push({
          title: title.trim(),
          excerpt: excerpt.trim() || undefined,
          content_md: description,
          category,
          image_url,
          source_url: link.trim(),
          published_at: new Date(pubDate).toISOString()
        });
      }
    }
    
    return items.slice(0, 20); // Limit to 20 most recent
  } catch (error) {
    console.error('Error fetching RSI news:', error);
    throw error;
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
