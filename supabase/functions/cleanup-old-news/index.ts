import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      // 1. Keep only 5 latest Server Status entries
      const { data: serverStatuses } = await supabase
        .from('server_status')
        .select('id, published_at')
        .order('published_at', { ascending: false });

      if (serverStatuses && serverStatuses.length > 5) {
        const idsToDelete = serverStatuses.slice(5).map(s => s.id);
        const { error: statusDeleteError } = await supabase
          .from('server_status')
          .delete()
          .in('id', idsToDelete);
        
        if (statusDeleteError) {
          console.error('Error deleting old server status:', statusDeleteError);
        } else {
          const deleted = idsToDelete.length;
          itemsDeleted += deleted;
          console.log(`Deleted ${deleted} old server status entries`);
        }
      }

      // 2. Keep only 5 latest New Ships news entries
      const { data: newShips } = await supabase
        .from('news')
        .select('id, published_at')
        .eq('category', 'New Ships')
        .order('published_at', { ascending: false });

      if (newShips && newShips.length > 5) {
        const idsToDelete = newShips.slice(5).map(s => s.id);
        const { error: shipsDeleteError } = await supabase
          .from('news')
          .delete()
          .in('id', idsToDelete);
        
        if (shipsDeleteError) {
          console.error('Error deleting old new ships news:', shipsDeleteError);
        } else {
          const deleted = idsToDelete.length;
          itemsDeleted += deleted;
          console.log(`Deleted ${deleted} old new ships news entries`);
        }
      }

      // 3. Delete regular news older than 1 month (excluding special categories)
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const { data: deletedNews, error: newsError } = await supabase
        .from('news')
        .delete()
        .lt('published_at', oneMonthAgo.toISOString())
        .not('category', 'in', '("Server Status","New Ships")')
        .select('id');

      if (newsError) {
        console.error('Error deleting old news:', newsError);
        throw newsError;
      }

      const newsDeleted = deletedNews?.length || 0;
      itemsDeleted += newsDeleted;
      console.log(`Deleted ${newsDeleted} regular news items older than 1 month`);

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
