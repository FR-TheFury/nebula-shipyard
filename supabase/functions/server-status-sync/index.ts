import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServerStatusItem {
  title: string;
  status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance';
  severity: 'info' | 'warning' | 'error' | 'critical';
  excerpt?: string;
  content_md?: string;
  published_at: string;
  source_url: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting server status sync...');

    const startTime = Date.now();
    let itemsSynced = 0;
    let errorMessage = null;

    // First, delete old Server Status entries if we have more than 5
    const { data: existingStatus, error: countError } = await supabase
      .from('server_status')
      .select('id, published_at')
      .order('published_at', { ascending: false });

    if (countError) {
      console.error('Error counting existing status:', countError);
    } else if (existingStatus && existingStatus.length >= 5) {
      // Keep only the 4 most recent to make room for the new one
      const idsToDelete = existingStatus.slice(4).map(s => s.id);
      const { error: deleteError } = await supabase
        .from('server_status')
        .delete()
        .in('id', idsToDelete);
      
      if (deleteError) {
        console.error('Error deleting old status:', deleteError);
      } else {
        console.log(`Deleted ${idsToDelete.length} old server status entries`);
      }
    }

    try {
      console.log('Fetching server status from RSI Status RSS feed...');
      
      // Fetch RSS feed from RSI Status page
      const response = await fetch('https://status.robertsspaceindustries.com/index.xml');
      
      if (!response.ok) {
        throw new Error(`RSS feed returned ${response.status}`);
      }

      const rssText = await response.text();
      
      // Parse RSS XML to extract status information
      // Look for recent incidents or status updates
      const currentTime = new Date().toISOString();
      
      // Check if there are any active incidents in the RSS
      const hasIncidents = rssText.includes('<item>');
      const isOperational = !hasIncidents || !rssText.toLowerCase().includes('outage') && !rssText.toLowerCase().includes('maintenance');
      
      const status: ServerStatusItem['status'] = isOperational ? 'operational' : 'degraded';
      const severity: ServerStatusItem['severity'] = isOperational ? 'info' : 'warning';
      
      // Extract title from RSS if available
      let statusTitle = 'Star Citizen Services - All Systems Operational';
      const titleMatch = rssText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      if (titleMatch && titleMatch[1] && titleMatch[1] !== 'RSI Status') {
        statusTitle = titleMatch[1];
      }
      
      // Create hash based on actual content, not time
      const contentForHash = `${statusTitle}_${status}_${severity}`;
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(contentForHash)
      );
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 16);
      
      // Check if an entry with the same content already exists
      const { data: existing } = await supabase
        .from('server_status')
        .select('id, hash, published_at')
        .eq('hash', hash)
        .maybeSingle();

      if (existing) {
        // Content hasn't changed, just update the timestamp
        const { error: updateError } = await supabase
          .from('server_status')
          .update({ 
            published_at: currentTime,
            updated_at: currentTime 
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error('Error updating timestamp:', updateError);
        } else {
          console.log(`Status unchanged - updated timestamp only (last: ${existing.published_at})`);
        }

        // IMPORTANT: Also update the news entry timestamp so the card shows current time
        const newsHash = `news_${hash}`;
        const { error: newsUpdateError } = await supabase
          .from('news')
          .update({ 
            published_at: currentTime,
            updated_at: currentTime 
          })
          .eq('hash', newsHash);

        if (newsUpdateError) {
          console.error('Error updating news timestamp:', newsUpdateError);
        }
      } else {
        // Content has changed, create new entry
        const statusData = {
          hash,
          title: statusTitle,
          excerpt: `Current server status: ${status}`,
          content_md: `## Server Status\n\n**Status:** ${status}\n**Severity:** ${severity}\n\nLast updated: ${currentTime}\n\n${hasIncidents ? 'Check RSS feed for details on current incidents.' : 'All systems are currently operational.'}`,
          status,
          severity,
          category: 'Server Status',
          published_at: currentTime,
          source: JSON.stringify({
            source: 'rsi',
            url: 'https://status.robertsspaceindustries.com/',
            ts: currentTime,
          }),
          source_url: 'https://status.robertsspaceindustries.com/',
        };

        const { error: statusError } = await supabase
          .from('server_status')
          .insert([statusData]);

        if (statusError) {
          console.error('Error inserting status:', statusError);
          throw statusError;
        }

        // Also create a news entry for the galactic map
        const newsHash = `news_${hash}`;
        const { error: newsError } = await supabase
          .from('news')
          .insert([{
            hash: newsHash,
            title: statusData.title,
            excerpt: statusData.excerpt,
            content_md: statusData.content_md,
            category: 'Server Status',
            published_at: statusData.published_at,
            source: statusData.source,
            source_url: statusData.source_url,
            image_url: null,
          }]);

        if (newsError && newsError.code !== '23505') { // Ignore duplicate key errors
          console.error('Error inserting news:', newsError);
          throw newsError;
        }

        itemsSynced++;
        console.log(`✓ New server status created: ${status}`);
      }

    } catch (error) {
      console.error('Error during sync:', error);
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    // Log to cron_job_history
    const duration = Date.now() - startTime;
    await supabase.from('cron_job_history').insert({
      job_name: 'server-status-sync',
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
    console.error('Server status sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});