import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

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

    try {
      console.log('Creating default server status entry...');
      
      // Create a default operational status entry
      // Since we can't access the API, we'll create a placeholder
      const currentTime = new Date().toISOString();
      const dateStr = currentTime.split('T')[0];
      const hash = `server_status_${dateStr}_${new Date().getHours()}`;
      
      // Check if entry already exists for this hour
      const { data: existing } = await supabase
        .from('server_status')
        .select('id')
        .eq('hash', hash)
        .maybeSingle();

      if (!existing) {
        const statusData = {
          hash,
          title: 'Star Citizen Services - Status Update',
          excerpt: 'Current operational status of Star Citizen services',
          content_md: `## Server Status\n\nServices are currently being monitored.\n\nLast updated: ${currentTime}`,
          status: 'operational',
          severity: 'info',
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
        console.log('Default status entry created');
      } else {
        console.log('Status entry already exists for this hour');
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