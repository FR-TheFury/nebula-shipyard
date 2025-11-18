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
  content?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting new ships sync from RSI RSS...');

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

      // First, delete old New Ships entries if we have more than 5
      const { data: existingShips, error: countError } = await supabase
        .from('news')
        .select('id, published_at')
        .eq('category', 'New Ships')
        .order('published_at', { ascending: false });

      if (countError) {
        console.error('Error counting existing ships:', countError);
      } else if (existingShips && existingShips.length >= 5) {
        // Keep only the 4 most recent to make room for new ones
        const idsToDelete = existingShips.slice(4).map(s => s.id);
        const { error: deleteError } = await supabase
          .from('news')
          .delete()
          .in('id', idsToDelete);
        
        if (deleteError) {
          console.error('Error deleting old ships news:', deleteError);
        } else {
          console.log(`Deleted ${idsToDelete.length} old new ships news entries`);
        }
      }

      // Fetch RSS feed
      const response = await fetch(RSI_RSS_URL);
      const rssText = await response.text();
      
      // Parse RSS XML
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

      // Keywords to identify new ship announcements
      const shipKeywords = [
        'new ship',
        'ship reveal',
        'now available',
        'flight ready',
        'introducing',
        'concept sale',
        'straight to flyable',
        'revealed',
        'announced'
      ];

      // Filter items that mention ships
      const shipNewsItems = items.filter(item => {
        const combinedText = `${item.title} ${item.description}`.toLowerCase();
        return shipKeywords.some(keyword => combinedText.includes(keyword));
      });

      console.log(`Found ${shipNewsItems.length} potential ship news items`);

      // Process each ship news item
      for (const item of shipNewsItems.slice(0, 5)) { // Limit to 5 max
        const publishedDate = new Date(item.pubDate);
        
        // Generate hash based on title and link
        const encoder = new TextEncoder();
        const data = encoder.encode(`${item.title}-${item.link}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if already exists
        const { data: existing } = await supabase
          .from('news')
          .select('id')
          .eq('hash', hash)
          .single();

        if (existing) {
          console.log(`Ship news already exists: ${item.title}`);
          
          // Update published_at and updated_at to keep it recent
          await supabase
            .from('news')
            .update({
              published_at: publishedDate.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
          
          continue;
        }

        // Extract image if available
        const imageMatch = item.description.match(/<img[^>]+src=\"([^\">]+)\"/);
        const imageUrl = imageMatch ? imageMatch[1] : null;

        // Clean description
        const excerpt = item.description
          .replace(/<[^>]*>/g, '')
          .replace(/&[^;]+;/g, ' ')
          .trim()
          .substring(0, 200);

        // Insert new news entry
        const { error: insertError } = await supabase
          .from('news')
          .insert({
            title: item.title,
            excerpt,
            content_md: item.description,
            category: 'New Ships',
            source_url: item.link,
            published_at: publishedDate.toISOString(),
            hash,
            image_url: imageUrl,
            source: {
              source: 'rsi_rss',
              ts: new Date().toISOString(),
              url: RSI_RSS_URL
            },
            tags: ['ships', 'announcement']
          });

        if (insertError) {
          console.error(`Error inserting ship news: ${item.title}`, insertError);
        } else {
          console.log(`✅ Created new ship news: ${item.title}`);
          itemsSynced++;
        }
      }

      // Release lock
      await supabase.rpc('release_function_lock', {
        p_function_name: functionName
      });

      console.log(`Sync completed. Items synced: ${itemsSynced}`);

    } catch (error) {
      console.error('Error during sync:', error);
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Try to release lock on error
      try {
        await supabase.rpc('release_function_lock', {
          p_function_name: 'new-ships-sync'
        });
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

