import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RSI_RSS_URL = 'https://robertsspaceindustries.com/comm-link/rss';

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting enhanced new ships sync...');

    const startTime = Date.now();
    let itemsSynced = 0;
    let errorMessage = null;

    try {
      // Acquire lock
      const functionName = 'new-ships-sync';
      const { data: lockAcquired } = await supabase.rpc('acquire_function_lock', {
        p_function_name: functionName,
        p_lock_duration_seconds: 600
      });

      if (!lockAcquired) {
        console.log('Another instance is already running');
        return new Response(
          JSON.stringify({ message: 'Another sync is already in progress' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        );
      }

      console.log('Lock acquired, starting sync...');

      // Clean up old New Ships entries (keep only 5 most recent)
      const { data: existingShips } = await supabase
        .from('news')
        .select('id, published_at')
        .eq('category', 'New Ships')
        .order('published_at', { ascending: false });

      if (existingShips && existingShips.length >= 5) {
        const idsToDelete = existingShips.slice(4).map(s => s.id);
        await supabase.from('news').delete().in('id', idsToDelete);
        console.log(`Cleaned up ${idsToDelete.length} old New Ships entries`);
      }

      // ========== SOURCE 1: RSI RSS Feed ==========
      console.log('📡 Source 1: Fetching RSI RSS feed...');
      try {
        const response = await fetch(RSI_RSS_URL);
        const rssText = await response.text();
        
        const itemMatches = rssText.matchAll(/<item>([\s\S]*?)<\/item>/g);
        const items: RSSItem[] = [];
        
        for (const match of itemMatches) {
          const itemContent = match[1];
          const title = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || '';
          const link = itemContent.match(/<link>(.*?)<\/link>/)?.[1] || '';
          const pubDate = itemContent.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
          const description = itemContent.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || '';
          
          items.push({ title, link, pubDate, description });
        }

        console.log(`Found ${items.length} RSS items`);

        // Enhanced keywords for ship detection
        const shipKeywords = [
          'new ship', 'ship reveal', 'now available', 'flight ready',
          'introducing', 'concept sale', 'straight to flyable', 'revealed',
          'announced', 'flyable', 'in the pledge store', 'ship sale',
          'vehicle sale', 'galactic guide', 'ship shape', 'meet the',
          'unveil', 'debut', 'launch', 'premiere'
        ];

        // Ship manufacturer names for better detection
        const manufacturers = [
          'aegis', 'anvil', 'aopoa', 'argo', 'banu', 'consolidated outland',
          'crusader', 'drake', 'esperia', 'gatac', 'greycat', 'kruger',
          'misc', 'origin', 'rsi', 'tumbril', 'vanduul', 'mirai', 'roberts space industries'
        ];

        const shipNewsItems = items.filter(item => {
          const combinedText = `${item.title} ${item.description}`.toLowerCase();
          const hasKeyword = shipKeywords.some(keyword => combinedText.includes(keyword));
          const hasManufacturer = manufacturers.some(mfr => combinedText.includes(mfr));
          return hasKeyword || hasManufacturer;
        });

        console.log(`Found ${shipNewsItems.length} potential ship news from RSS`);

        for (const item of shipNewsItems.slice(0, 3)) {
          const publishedDate = new Date(item.pubDate);
          
          const encoder = new TextEncoder();
          const data = encoder.encode(`${item.title}-${item.link}`);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          const { data: existing } = await supabase
            .from('news')
            .select('id')
            .eq('hash', hash)
            .single();

          if (existing) continue;

          const imageMatch = item.description.match(/<img[^>]+src=\"([^\">]+)\"/);
          const imageUrl = imageMatch ? imageMatch[1] : null;

          const excerpt = item.description
            .replace(/<[^>]*>/g, '')
            .replace(/&[^;]+;/g, ' ')
            .trim()
            .substring(0, 200);

          await supabase.from('news').insert({
            title: item.title,
            excerpt,
            content_md: item.description,
            category: 'New Ships',
            source_url: item.link,
            published_at: publishedDate.toISOString(),
            hash,
            image_url: imageUrl,
            source: { source: 'rsi_rss', ts: new Date().toISOString(), url: RSI_RSS_URL },
            tags: ['ships', 'announcement']
          });

          console.log(`✅ Created RSS news: ${item.title}`);
          itemsSynced++;
        }
      } catch (rssError) {
        console.error('RSS fetch error:', rssError);
      }

      // ========== SOURCE 2: Recently Flight Ready Ships ==========
      console.log('🚀 Source 2: Checking recently flight ready ships...');
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const { data: flightReadyShips } = await supabase
          .from('ships')
          .select('name, slug, manufacturer, image_url, flight_ready_since, production_status')
          .not('flight_ready_since', 'is', null)
          .gte('flight_ready_since', thirtyDaysAgo)
          .order('flight_ready_since', { ascending: false })
          .limit(5);

        console.log(`Found ${flightReadyShips?.length || 0} recently flight ready ships`);

        if (flightReadyShips) {
          for (const ship of flightReadyShips) {
            const hash = `flight-ready-${ship.slug}-${ship.flight_ready_since}`;
            
            const { data: existing } = await supabase
              .from('news')
              .select('id')
              .eq('hash', hash)
              .single();

            if (existing) continue;

            const title = `${ship.name} is Now Flight Ready!`;
            const excerpt = `The ${ship.manufacturer || ''} ${ship.name} is now available to fly in Star Citizen. This ship has transitioned from concept to flight ready status.`;

            await supabase.from('news').insert({
              title,
              excerpt,
              content_md: `# ${ship.name} - Now Flight Ready!\n\n${excerpt}\n\n[View Ship Details](/ships/${ship.slug})`,
              category: 'New Ships',
              source_url: `https://starcitizen.tools/${encodeURIComponent(ship.name)}`,
              published_at: ship.flight_ready_since,
              hash,
              image_url: ship.image_url,
              source: { source: 'ships_db', ts: new Date().toISOString(), ship_slug: ship.slug },
              tags: ['ships', 'flight-ready', ship.manufacturer?.toLowerCase() || 'unknown']
            });

            console.log(`✅ Created flight ready news: ${ship.name}`);
            itemsSynced++;
          }
        }
      } catch (flightReadyError) {
        console.error('Flight ready check error:', flightReadyError);
      }

      // ========== SOURCE 3: Recently Added Ships ==========
      console.log('📦 Source 3: Checking recently added ships...');
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        
        // Find ships that were added recently (based on updated_at being close to a recent date)
        const { data: recentShips } = await supabase
          .from('ships')
          .select('name, slug, manufacturer, image_url, updated_at, production_status')
          .gte('updated_at', sevenDaysAgo)
          .is('flight_ready_since', null) // Not flight ready (so it's a concept or in production)
          .order('updated_at', { ascending: false })
          .limit(3);

        console.log(`Found ${recentShips?.length || 0} recently updated concept ships`);

        if (recentShips) {
          for (const ship of recentShips) {
            // Only create news for concept or in-production ships
            const status = ship.production_status?.toLowerCase() || '';
            if (!status.includes('concept') && !status.includes('production') && !status.includes('development')) {
              continue;
            }

            const hash = `new-ship-${ship.slug}-${ship.updated_at?.substring(0, 10)}`;
            
            const { data: existing } = await supabase
              .from('news')
              .select('id')
              .eq('hash', hash)
              .single();

            if (existing) continue;

            const statusText = status.includes('concept') ? 'Concept' : 'In Development';
            const title = `New Ship Added: ${ship.name} (${statusText})`;
            const excerpt = `The ${ship.manufacturer || ''} ${ship.name} has been added to the ship database. Current status: ${ship.production_status || statusText}.`;

            await supabase.from('news').insert({
              title,
              excerpt,
              content_md: `# ${ship.name}\n\n${excerpt}\n\n[View Ship Details](/ships/${ship.slug})`,
              category: 'New Ships',
              source_url: `https://starcitizen.tools/${encodeURIComponent(ship.name)}`,
              published_at: ship.updated_at,
              hash,
              image_url: ship.image_url,
              source: { source: 'ships_db', ts: new Date().toISOString(), ship_slug: ship.slug },
              tags: ['ships', 'concept', ship.manufacturer?.toLowerCase() || 'unknown']
            });

            console.log(`✅ Created new ship news: ${ship.name}`);
            itemsSynced++;
          }
        }
      } catch (recentShipsError) {
        console.error('Recent ships check error:', recentShipsError);
      }

      // Release lock
      await supabase.rpc('release_function_lock', { p_function_name: functionName });

      console.log(`Sync completed. Items synced: ${itemsSynced}`);

    } catch (error) {
      console.error('Error during sync:', error);
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      try {
        await supabase.rpc('release_function_lock', { p_function_name: 'new-ships-sync' });
      } catch (lockError) {
        console.error('Error releasing lock:', lockError);
      }
    }

    // Log to cron_job_history
    const duration = Date.now() - startTime;
    await supabase.from('cron_job_history').insert({
      job_name: 'new-ships-sync',
      status: errorMessage ? 'error' : 'success',
      items_synced: itemsSynced,
      duration_ms: duration,
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({
        success: !errorMessage,
        itemsSynced,
        duration,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: errorMessage ? 500 : 200,
      }
    );

  } catch (error) {
    console.error('New ships sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
