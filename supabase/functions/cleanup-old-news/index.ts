import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting cleanup of old news...');

    const startTime = Date.now();
    let itemsDeleted = 0;
    let errorMessage = null;

    try {
      // Calculate date 1 month ago
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      // Delete news older than 1 month (EXCEPT Server Status category)
      const { data: deletedNews, error: newsError } = await supabase
        .from('news')
        .delete()
        .lt('published_at', oneMonthAgo.toISOString())
        .neq('category', 'Server Status')
        .select('id');

      if (newsError) {
        console.error('Error deleting old news:', newsError);
        throw newsError;
      }

      const newsDeleted = deletedNews?.length || 0;
      itemsDeleted += newsDeleted;
      console.log(`Deleted ${newsDeleted} news items older than 1 month`);

      // Delete server status older than 1 month
      const { data: deletedStatus, error: statusError } = await supabase
        .from('server_status')
        .delete()
        .lt('published_at', oneMonthAgo.toISOString())
        .select('id');

      if (statusError) {
        console.error('Error deleting old server status:', statusError);
        throw statusError;
      }

      const statusDeleted = deletedStatus?.length || 0;
      itemsDeleted += statusDeleted;
      console.log(`Deleted ${statusDeleted} server status items older than 1 month`);

      console.log(`Cleanup completed. Total items deleted: ${itemsDeleted}`);

    } catch (error) {
      console.error('Error during cleanup:', error);
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    // Log to cron_job_history
    const duration = Date.now() - startTime;
    await supabase.from('cron_job_history').insert({
      job_name: 'cleanup-old-news',
      status: errorMessage ? 'error' : 'success',
      items_synced: itemsDeleted,
      duration_ms: duration,
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({
        success: !errorMessage,
        itemsDeleted,
        duration,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: errorMessage ? 500 : 200,
      }
    );

  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
