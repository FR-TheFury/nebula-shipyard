import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🧹 Starting cleanup of all sync data...');

    // 1. Delete all locks
    const { error: lockError } = await supabase
      .from('edge_function_locks')
      .delete()
      .neq('function_name', ''); // Delete all locks

    if (lockError) {
      console.error('Error deleting locks:', lockError);
      throw lockError;
    }

    console.log('✅ Deleted all edge function locks');

    // 2. Cancel all running sync_progress entries
    const { error: progressError } = await supabase
      .from('sync_progress')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error_message: 'Manually cancelled by admin'
      })
      .eq('status', 'running');

    if (progressError) {
      console.error('Error updating sync_progress:', progressError);
      throw progressError;
    }

    console.log('✅ Cancelled all running sync_progress entries');

    // 3. Update cron_job_history running entries
    const { error: cronError } = await supabase
      .from('cron_job_history')
      .update({
        status: 'failed',
        duration_ms: 0,
        error_message: 'Manually cancelled by admin'
      })
      .eq('status', 'running');

    if (cronError) {
      console.error('Error updating cron_job_history:', cronError);
      throw cronError;
    }

    console.log('✅ Cancelled all running cron_job_history entries');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Successfully cleaned up all locks, sync_progress, and cron_job_history'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in cleanup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
