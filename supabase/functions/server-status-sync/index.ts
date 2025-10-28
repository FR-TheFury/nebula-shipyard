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
      // Fetch server status from RSI status page
      const response = await fetch('https://status.robertsspaceindustries.com/api/v2/status.json');
      
      if (!response.ok) {
        throw new Error(`RSI Status API returned ${response.status}`);
      }

      const data = await response.json();
      const statusItems: ServerStatusItem[] = [];

      // Parse status page data
      if (data.status) {
        const currentStatus = data.status.description || 'All Systems Operational';
        const statusIndicator = data.status.indicator || 'none';
        
        // Map indicator to our status enum
        const statusMap: Record<string, ServerStatusItem['status']> = {
          'none': 'operational',
          'minor': 'degraded',
          'major': 'partial_outage',
          'critical': 'major_outage',
          'maintenance': 'maintenance',
        };

        const severityMap: Record<string, ServerStatusItem['severity']> = {
          'none': 'info',
          'minor': 'warning',
          'major': 'error',
          'critical': 'critical',
          'maintenance': 'info',
        };

        statusItems.push({
          title: currentStatus,
          status: statusMap[statusIndicator] || 'operational',
          severity: severityMap[statusIndicator] || 'info',
          excerpt: `Current server status: ${currentStatus}`,
          content_md: `## Server Status\n\n${currentStatus}\n\nLast updated: ${new Date().toISOString()}`,
          published_at: new Date().toISOString(),
          source_url: 'https://status.robertsspaceindustries.com/',
        });
      }

      // Fetch recent incidents
      if (data.incidents && Array.isArray(data.incidents)) {
        for (const incident of data.incidents.slice(0, 5)) {
          const incidentStatus = incident.status || 'investigating';
          const statusMap: Record<string, ServerStatusItem['status']> = {
            'investigating': 'partial_outage',
            'identified': 'partial_outage',
            'monitoring': 'degraded',
            'resolved': 'operational',
            'scheduled': 'maintenance',
          };

          statusItems.push({
            title: incident.name || 'Server Incident',
            status: statusMap[incidentStatus] || 'degraded',
            severity: incident.impact === 'critical' ? 'critical' : 'error',
            excerpt: incident.status || '',
            content_md: incident.incident_updates?.map((u: any) => 
              `**${u.status}** (${new Date(u.created_at).toLocaleString()})\n\n${u.body}`
            ).join('\n\n---\n\n') || '',
            published_at: incident.created_at || new Date().toISOString(),
            source_url: incident.shortlink || 'https://status.robertsspaceindustries.com/',
          });
        }
      }

      // Insert or update server status items
      for (const item of statusItems) {
        const hash = `server_status_${item.published_at}_${item.title.substring(0, 50)}`;
        
        const { error } = await supabase
          .from('server_status')
          .upsert({
            hash,
            title: item.title,
            excerpt: item.excerpt,
            content_md: item.content_md,
            status: item.status,
            severity: item.severity,
            category: 'Server Status',
            published_at: item.published_at,
            source: {
              source: 'rsi',
              url: item.source_url,
              ts: new Date().toISOString(),
            },
            source_url: item.source_url,
          }, {
            onConflict: 'hash'
          });

        if (error) {
          console.error('Error upserting server status:', error);
        } else {
          itemsSynced++;
        }
      }

      // Also insert as news items for the galactic map
      for (const item of statusItems) {
        const hash = `news_server_${item.published_at}_${item.title.substring(0, 50)}`;
        
        const { error } = await supabase
          .from('news')
          .upsert({
            hash,
            title: item.title,
            excerpt: item.excerpt,
            content_md: item.content_md,
            category: 'Server Status',
            published_at: item.published_at,
            source: {
              source: 'rsi',
              url: item.source_url,
              ts: new Date().toISOString(),
            },
            source_url: item.source_url,
          }, {
            onConflict: 'hash'
          });

        if (error) {
          console.error('Error upserting news item:', error);
        }
      }

      console.log(`Synced ${itemsSynced} server status items`);

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