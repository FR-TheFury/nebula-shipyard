import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.3.5';

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
    
    const res = await fetch('https://robertsspaceindustries.com/comm-link/rss', {
      headers: {
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
        'User-Agent': 'SC-Recorder/1.0'
      }
    });
    
    if (!res.ok) {
      console.error(`Leonick Atom feed returned status ${res.status}`);
      return [];
    }
    
    const xmlText = await res.text();
    const newsItems: NewsItem[] = [];

    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', cdataPropName: '#text' });
      const xmlObj = parser.parse(xmlText);
      const feed = xmlObj?.feed || {};
      const entriesRaw = feed.entry || [];
      const entries: any[] = Array.isArray(entriesRaw) ? entriesRaw : (entriesRaw ? [entriesRaw] : []);

      console.log(`Found ${entries.length} entries in Atom feed (fast-xml-parser)`);

      for (const e of entries.slice(0, 20)) {
        try {
          const links = e.link ? (Array.isArray(e.link) ? e.link : [e.link]) : [];
          const altLink = links.find((l: any) => (l['@_rel'] || 'alternate') === 'alternate' && l['@_href']);
          const anyLink = links.find((l: any) => l['@_href']);
          const source_url = ((altLink?.['@_href']) || (anyLink?.['@_href']) || (typeof e.id === 'string' ? e.id : '')).trim();

          if (!source_url || !/^https?:\/\//i.test(source_url)) {
            console.log('No valid link found, skipping entry');
            continue;
          }

          const titleRaw = typeof e.title === 'string' ? e.title : (e.title?.['#text'] || '');
          let title = cleanText(titleRaw || '');
          if (!title || title.length < 5) {
            console.log('Title too short:', title);
            continue;
          }

          const summaryRaw = typeof e.summary === 'string' ? e.summary : (e.summary?.['#text'] || '');
          const excerpt = summaryRaw ? cleanText(summaryRaw).substring(0, 300) : undefined;

          const contentRaw = typeof e.content === 'string' ? e.content : (e.content?.['#text'] || '');
          const content_md = contentRaw ? cleanText(contentRaw) : undefined;

          let image_url: string | undefined;
          const mediaThumb = e['media:thumbnail'] || e.thumbnail;
          if (mediaThumb) {
            image_url = mediaThumb['@_url'] || mediaThumb.url;
          }
          if (!image_url) {
            const encl = e.enclosure ? (Array.isArray(e.enclosure) ? e.enclosure[0] : e.enclosure) : undefined;
            image_url = encl?.['@_url'] || encl?.url;
          }
          if (!image_url && links.length) {
            const encLink = links.find((l: any) => (l['@_rel'] || '') === 'enclosure');
            image_url = encLink?.['@_href'] || undefined;
          }

          const publishedStr = (typeof e.published === 'string' ? e.published : undefined) || (typeof e.updated === 'string' ? e.updated : undefined);
          const published_at = publishedStr ? new Date(publishedStr).toISOString() : new Date().toISOString();

          const category = parseCategory(source_url + ' ' + (excerpt || ''));

          newsItems.push({
            title,
            excerpt,
            content_md,
            category,
            image_url,
            source_url,
            published_at
          });
        } catch (err) {
          console.error('Error processing entry (xml parser):', err);
        }
      }

      console.log(`✅ Successfully parsed ${newsItems.length} news items from Atom feed (xml parser)`);
    } catch (err) {
      console.error('XML parsing failed:', err);
    }

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
