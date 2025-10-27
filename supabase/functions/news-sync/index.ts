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

// Sources à tester (en ordre de préférence)
const NEWS_SOURCES = [
  { url: 'https://leonick.se/feeds/rsi/atom', type: 'atom', name: 'leonick-atom' },
  { url: 'https://leonick.se/feeds/rsi/rss', type: 'rss', name: 'leonick-rss' },
  { url: 'https://robertsspaceindustries.com/comm-link/rss', type: 'rss', name: 'rsi-rss' },
];

function stableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

async function sha256(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function toText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    // Try common XML text properties
    if (value['#text']) {
      const textValue = value['#text'];
      // If #text is an array, process first element or join
      if (Array.isArray(textValue)) {
        if (textValue.length === 0) return '';
        // Recursively extract text from first element
        return toText(textValue[0]);
      }
      return String(textValue);
    }
    if (value['_']) return String(value['_']);
    if (value['#cdata-section']) return String(value['#cdata-section']);
    // If it's an array, join the text content
    if (Array.isArray(value)) {
      return value.map(v => toText(v)).join(' ');
    }
    // Last resort: log and return empty
    console.warn('⚠️ Could not extract text from object:', JSON.stringify(value).slice(0, 100));
    return '';
  }
  return String(value);
}

function cleanText(text: any): string {
  const str = toText(text);
  if (!str) return '';
  return str.replace(/\s+/g, ' ').replace(/[\n\r\t]/g, ' ').trim();
}

function stripHtml(html: any): string {
  const str = toText(html);
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractImageFromHtml(html: any): string | undefined {
  const str = toText(html);
  if (!str || str.length < 10) return undefined;
  const imgMatch = str.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch?.[1];
}

function parseCategory(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Map URL paths to valid categories
  if (lowerText.includes('/transmission/')) return 'Update';
  if (lowerText.includes('/engineering/')) return 'Feature';
  if (lowerText.includes('/spectrum')) return 'Community';
  if (lowerText.includes('/citizens')) return 'Community';
  if (lowerText.includes('update')) return 'Update';
  if (lowerText.includes('feature')) return 'Feature';
  if (lowerText.includes('sale') || lowerText.includes('promo')) return 'Sale';
  if (lowerText.includes('event')) return 'Event';
  
  return 'Community';
}

async function fetchWithDebug(url: string, sourceName: string): Promise<string | null> {
  try {
    console.log(`🔍 Fetching ${sourceName} from ${url}...`);
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      }
    });
    
    console.log(`📊 Status: ${res.status}, Content-Type: ${res.headers.get('content-type')}`);
    
    if (!res.ok) {
      console.error(`❌ ${sourceName} returned status ${res.status}`);
      return null;
    }
    
    const xmlText = await res.text();
    const contentLength = xmlText.length;
    console.log(`📦 Content length: ${contentLength} bytes`);
    
    if (contentLength < 100) {
      console.error(`❌ ${sourceName} content too short (${contentLength} bytes)`);
      console.log(`Preview: ${xmlText.substring(0, 200)}`);
      return null;
    }
    
    // Show preview (first 300 chars)
    console.log(`Preview: ${xmlText.substring(0, 300)}...`);
    
    return xmlText;
  } catch (error) {
    console.error(`❌ Error fetching ${sourceName}:`, error);
    return null;
  }
}

function parseAtomFeed(xmlObj: any): NewsItem[] {
  const newsItems: NewsItem[] = [];
  const feed = xmlObj?.feed || {};
  const entriesRaw = feed.entry || [];
  const entries: any[] = Array.isArray(entriesRaw) ? entriesRaw : (entriesRaw ? [entriesRaw] : []);

  console.log(`Found ${entries.length} Atom entries`);

  for (const e of entries.slice(0, 25)) {
    try {
      // Title - extract text properly
      let title = '';
      if (typeof e.title === 'string') {
        title = e.title;
      } else if (e.title) {
        // Log the structure to understand it
        console.log('Title structure:', JSON.stringify(e.title).substring(0, 200));
        title = toText(e.title);
      }
      title = cleanText(title);
      
      if (!title || title.length < 5) {
        console.log('Skipping entry: title too short or empty');
        continue;
      }

      // Link
      const links = e.link ? (Array.isArray(e.link) ? e.link : [e.link]) : [];
      const altLink = links.find((l: any) => (l['@_rel'] || 'alternate') === 'alternate' && l['@_href']);
      const anyLink = links.find((l: any) => l['@_href']);
      const source_url = toText(altLink?.['@_href'] || anyLink?.['@_href'] || e.id).trim();
      
      if (!source_url || !/^https?:\/\//i.test(source_url)) {
        console.log('Skipping entry: invalid source URL');
        continue;
      }

      // Excerpt
      let excerpt = '';
      if (typeof e.summary === 'string') {
        excerpt = e.summary;
      } else if (e.summary) {
        console.log('Summary structure:', JSON.stringify(e.summary).substring(0, 200));
        excerpt = toText(e.summary);
      }
      excerpt = cleanText(excerpt);
      const excerptFinal = excerpt ? excerpt.substring(0, 300) : undefined;

      // Content
      let content = '';
      if (typeof e.content === 'string') {
        content = e.content;
      } else if (e.content) {
        console.log('Content structure:', JSON.stringify(e.content).substring(0, 200));
        content = toText(e.content);
      }
      content = cleanText(content);
      const content_md = content ? content.substring(0, 5000) : undefined;

      // Image
      let image_url: string | undefined;
      const mediaThumb = e['media:thumbnail'] || e.thumbnail;
      if (mediaThumb) {
        image_url = toText(mediaThumb['@_url'] || mediaThumb.url);
      }
      if (!image_url) {
        const encl = e.enclosure ? (Array.isArray(e.enclosure) ? e.enclosure[0] : e.enclosure) : undefined;
        image_url = toText(encl?.['@_url'] || encl?.url);
      }
      if (!image_url) {
        image_url = extractImageFromHtml(e.content || e.summary);
      }

      // Published date
      const publishedStr = toText(e.published || e.updated);
      const published_at = publishedStr ? new Date(publishedStr).toISOString() : new Date().toISOString();

      // Category - extract from URL path or use parseCategory
      const category = parseCategory(source_url + ' ' + title + ' ' + (excerpt || ''));

      newsItems.push({
        title,
        excerpt: excerptFinal,
        content_md,
        category,
        image_url: image_url || undefined,
        source_url,
        published_at
      });
    } catch (err) {
      console.error('Error processing Atom entry:', err);
    }
  }

  return newsItems;
}

function parseRssFeed(xmlObj: any): NewsItem[] {
  const newsItems: NewsItem[] = [];
  const channel = xmlObj?.rss?.channel || {};
  const itemsRaw = channel.item || [];
  const items: any[] = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? [itemsRaw] : []);

  console.log(`Found ${items.length} RSS items`);

  for (const item of items.slice(0, 25)) {
    try {
      // Title
      const titleRaw = typeof item.title === 'string' ? item.title : (item.title?.['#text'] || '');
      const title = cleanText(titleRaw || '');
      if (!title || title.length < 5) continue;

      // Link
      const linkRaw = typeof item.link === 'string' ? item.link : (item.link?.['#text'] || '');
      const source_url = cleanText(linkRaw || '');
      if (!source_url || !/^https?:\/\//i.test(source_url)) continue;

      // Description (excerpt)
      const descRaw = typeof item.description === 'string' ? item.description : (item.description?.['#text'] || '');
      const excerpt = descRaw ? cleanText(stripHtml(descRaw)).substring(0, 300) : undefined;

      // Content
      const contentRaw = item['content:encoded'] || item.content || '';
      const content_md = contentRaw ? cleanText(stripHtml(contentRaw)).substring(0, 5000) : undefined;

      // Image
      let image_url: string | undefined;
      const enclRaw = item.enclosure;
      if (enclRaw) {
        image_url = enclRaw['@_url'] || enclRaw.url;
      }
      if (!image_url && descRaw) {
        image_url = extractImageFromHtml(descRaw);
      }
      if (!image_url && contentRaw) {
        image_url = extractImageFromHtml(contentRaw);
      }

      // Published date
      const pubDateStr = item.pubDate || item['dc:date'] || item.isoDate || item.updated || item.published;
      const published_at = pubDateStr ? new Date(pubDateStr).toISOString() : new Date().toISOString();

      // Category
      const categoryRaw = item.category?.['#text'] || item.category;
      const category = categoryRaw || parseCategory(source_url + ' ' + (excerpt || ''));

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
      console.error('Error processing RSS item:', err);
    }
  }

  return newsItems;
}

async function fetchNewsFromSources(): Promise<{ items: NewsItem[], sourceName: string } | null> {
  for (const source of NEWS_SOURCES) {
    console.log(`\n🎯 Trying source: ${source.name}`);
    
    const xmlText = await fetchWithDebug(source.url, source.name);
    if (!xmlText) continue;

    try {
      const parser = new XMLParser({ 
        ignoreAttributes: false, 
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        cdataPropName: '#text'
      });
      
      const xmlObj = parser.parse(xmlText);
      
      // Detect feed type
      let newsItems: NewsItem[] = [];
      if (xmlObj.feed) {
        console.log('✅ Detected Atom feed');
        newsItems = parseAtomFeed(xmlObj);
      } else if (xmlObj.rss) {
        console.log('✅ Detected RSS feed');
        newsItems = parseRssFeed(xmlObj);
      } else {
        console.error('❌ Unknown feed format (neither Atom nor RSS)');
        continue;
      }

      if (newsItems.length > 0) {
        console.log(`✅ Successfully parsed ${newsItems.length} items from ${source.name}`);
        return { items: newsItems, sourceName: source.name };
      } else {
        console.log(`⚠️ ${source.name} parsed but 0 items extracted`);
      }
    } catch (err) {
      console.error(`❌ Error parsing ${source.name}:`, err);
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let jobHistoryId: number | null = null;
  
  try {
    // Parse request body to detect auto_sync
    const { auto_sync, triggered_at } = await req.json().catch(() => ({ auto_sync: false }));
    
    console.log(`🚀 Starting news sync... (${auto_sync ? 'AUTO' : 'MANUAL'})`);
    
    // Create job history entry
    const { data: jobHistory } = await supabase
      .from('cron_job_history')
      .insert({
        job_name: 'news-sync',
        status: 'running'
      })
      .select('id')
      .single();
    
    jobHistoryId = jobHistory?.id || null;
    
    const result = await fetchNewsFromSources();
    
    if (!result) {
      console.error('❌ All sources failed');
      return new Response(
        JSON.stringify({ ok: false, error: 'All news sources failed', upserts: 0, errors: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { items: newsItems, sourceName } = result;
    console.log(`\n💾 Upserting ${newsItems.length} items from ${sourceName}...`);
    
    let upserts = 0;
    let errors = 0;

    for (const item of newsItems) {
      try {
        const toHash = { ...item };
        delete (toHash as any).image_url; // Image URLs are volatile
        
        const hash = await sha256(stableStringify(toHash));
        const source = {
          source: sourceName,
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
          console.error(`Error upserting "${item.title}":`, error);
          errors++;
        } else {
          upserts++;
        }
      } catch (err) {
        console.error(`Error processing "${item.title}":`, err);
        errors++;
      }
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      action: auto_sync ? 'auto_sync_news' : 'manual_sync_news',
      target: 'news',
      meta: {
        source: auto_sync ? 'cron' : 'admin_panel',
        feed_source: sourceName,
        total_items: newsItems.length,
        upserts,
        errors,
        timestamp: new Date().toISOString()
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

    console.log(`\n✅ News sync completed: ${upserts} upserts, ${errors} errors from ${sourceName}`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        source: sourceName,
        upserts, 
        errors,
        total: newsItems.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Fatal error in news-sync:', error);
    
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
