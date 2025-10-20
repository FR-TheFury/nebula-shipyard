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
    console.log('Fetching RSS from:', rssUrl);
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    console.log('RSS feed length:', text.length);
    
    // Parse RSS XML with improved regex patterns
    const items: NewsItem[] = [];
    
    // Try multiple patterns for item extraction
    const itemPatterns = [
      /<item>([\s\S]*?)<\/item>/gi,
      /<entry>([\s\S]*?)<\/entry>/gi
    ];
    
    let matches: IterableIterator<RegExpMatchArray> | null = null;
    for (const pattern of itemPatterns) {
      const found = text.matchAll(pattern);
      const firstMatch = found.next();
      if (!firstMatch.done) {
        matches = text.matchAll(pattern);
        console.log('Found items with pattern:', pattern);
        break;
      }
    }
    
    if (!matches) {
      console.log('No items found, RSS sample:', text.substring(0, 500));
      return [];
    }
    
    for (const match of matches) {
      const itemXml = match[1];
      
      // Try multiple extraction patterns
      const extractText = (patterns: string[]) => {
        for (const pattern of patterns) {
          const regex = new RegExp(pattern, 'is');
          const match = itemXml.match(regex);
          if (match) return match[1];
        }
        return '';
      };
      
      const title = extractText([
        '<title><!\\[CDATA\\[(.*?)\\]\\]></title>',
        '<title>(.*?)</title>'
      ]);
      
      const description = extractText([
        '<description><!\\[CDATA\\[(.*?)\\]\\]></description>',
        '<description>(.*?)</description>',
        '<content:encoded><!\\[CDATA\\[(.*?)\\]\\]></content:encoded>',
        '<summary>(.*?)</summary>'
      ]);
      
      const link = extractText([
        '<link>(.*?)</link>',
        '<guid>(.*?)</guid>'
      ]);
      
      const pubDate = extractText([
        '<pubDate>(.*?)</pubDate>',
        '<published>(.*?)</published>',
        '<updated>(.*?)</updated>'
      ]);
      
      // Extract category from title or content
      let category = 'Community';
      const titleLower = title.toLowerCase();
      const descLower = description.toLowerCase();
      
      if (titleLower.includes('patch') || titleLower.includes('update')) {
        category = 'Update';
      } else if (titleLower.includes('sale') || titleLower.includes('concept')) {
        category = 'Sale';
      } else if (titleLower.includes('event') || titleLower.includes('weekend')) {
        category = 'Event';
      } else if (titleLower.includes('tech') || titleLower.includes('performance')) {
        category = 'Tech';
      } else if (descLower.includes('feature') || titleLower.includes('new')) {
        category = 'Feature';
      }
      
      // Extract image from description if available
      const imgMatch = description.match(/<img[^>]+src=["']([^"'>]+)["']/i);
      const image_url = imgMatch ? imgMatch[1] : undefined;
      
      // Clean excerpt (remove HTML tags)
      const excerpt = description.replace(/<[^>]*>/g, '').substring(0, 200);
      
      if (title && link) {
        const published = pubDate ? new Date(pubDate) : new Date();
        items.push({
          title: title.trim(),
          excerpt: excerpt.trim() || undefined,
          content_md: description,
          category,
          image_url,
          source_url: link.trim(),
          published_at: published.toISOString()
        });
      }
    }
    
    console.log(`Parsed ${items.length} news items`);
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
