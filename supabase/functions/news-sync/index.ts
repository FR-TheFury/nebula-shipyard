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

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[\n\r\t]/g, ' ').trim();
}

function parseCategory(text: string): string {
  const categoryMap: Record<string, string> = {
    'transmission': 'Transmission',
    'engineering': 'Engineering',
    'spectrum': 'Spectrum Dispatch',
    'citizens': 'Citizens',
    'update': 'Update',
    'feature': 'Feature',
    'sale': 'Sale',
    'event': 'Event',
  };
  
  const lowerText = text.toLowerCase();
  for (const [key, value] of Object.entries(categoryMap)) {
    if (lowerText.includes(key)) return value;
  }
  
  return 'Community';
}

async function fetchRSINews(): Promise<NewsItem[]> {
  try {
    console.log('🚀 Fetching comm-links from RSI Atom feed via leonick.se...');
    
    const res = await fetch('https://leonick.se/feeds/rsi/atom', {
      headers: {
        'Accept': 'application/atom+xml,application/xml,text/xml',
        'User-Agent': 'SC-Recorder/1.0'
      }
    });
    
    if (!res.ok) {
      console.error(`Leonick Atom feed returned status ${res.status}`);
      return [];
    }
    
    const xmlText = await res.text();
    const newsItems: NewsItem[] = [];
    
    // Use regex to parse XML entries (simple but effective for Atom feeds)
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const entries = Array.from(xmlText.matchAll(entryRegex));
    
    console.log(`Found ${entries.length} entries in Atom feed`);
    
    for (const entryMatch of entries.slice(0, 20)) {
      try {
        const entryXml = entryMatch[1];
        
        // Extract link first
        const linkMatch = entryXml.match(/<link[^>]*href="([^"]+)"/);
        if (!linkMatch) {
          console.log('No link found, skipping entry');
          continue;
        }
        const source_url = linkMatch[1];
        
        // Extract title - handle both CDATA and HTML entities
        const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/);
        if (!titleMatch) {
          console.log('No title found for', source_url);
          continue;
        }
        let title = titleMatch[1]
          .replace(/&lt;!\[CDATA\[(.*?)\]\]&gt;/g, '$1')
          .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
        title = cleanText(title);
        
        if (!title || title.length < 5) {
          console.log('Title too short:', title);
          continue;
        }
        
        // Extract summary/excerpt
        const summaryMatch = entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
        const excerpt = summaryMatch 
          ? cleanText(summaryMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')).substring(0, 300)
          : undefined;
        
        // Extract content
        const contentMatch = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/);
        const content_md = contentMatch
          ? cleanText(contentMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ''))
          : undefined;
        
        // Extract image
        const imageMatch = entryXml.match(/<media:thumbnail[^>]*url="([^"]+)"|<enclosure[^>]*url="([^"]+)"|<link[^>]*rel="enclosure"[^>]*href="([^"]+)/);
        const image_url = imageMatch ? (imageMatch[1] || imageMatch[2] || imageMatch[3]) : undefined;
        
        // Extract category from URL or content
        const category = parseCategory(source_url + ' ' + (excerpt || ''));
        
        // Extract published date
        const publishedMatch = entryXml.match(/<published>(.*?)<\/published>|<updated>(.*?)<\/updated>/);
        const published_at = publishedMatch
          ? new Date(publishedMatch[1] || publishedMatch[2]).toISOString()
          : new Date().toISOString();
        
        const newsItem: NewsItem = {
          title,
          excerpt,
          content_md,
          category,
          image_url,
          source_url,
          published_at
        };
        
        newsItems.push(newsItem);
        
      } catch (err) {
        console.error('Error processing entry:', err);
      }
    }
    
    console.log(`✅ Successfully parsed ${newsItems.length} news items from Atom feed`);
    return newsItems;
  } catch (error) {
    console.error('Error fetching Atom feed:', error);
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
    console.log(`Fetched ${newsItems.length} items from RSI Atom feed`);
    
    let upserts = 0;
    let errors = 0;

    for (const item of newsItems) {
      try {
        const toHash = { ...item };
        delete (toHash as any).image_url; // Image URLs are volatile
        
        const hash = await sha256(stableStringify(toHash));
        const source = {
          source: 'leonick-atom-feed',
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
