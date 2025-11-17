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

    console.log('🧹 Starting cleanup of sync locks...');

    // Delete all locks for ships-sync
    const { error: lockError } = await supabase
      .from('edge_function_locks')
      .delete()
      .eq('function_name', 'ships-sync');

    if (lockError) {
      console.error('Error deleting locks:', lockError);
      throw lockError;
    }

    console.log('✅ Deleted all ships-sync locks');

    // Cancel all running sync_progress entries
    const { error: progressError } = await supabase
      .from('sync_progress')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error_message: 'Manually cancelled by admin'
      })
      .eq('function_name', 'ships-sync')
      .eq('status', 'running');

    if (progressError) {
      console.error('Error updating progress:', progressError);
      throw progressError;
    }

    console.log('✅ Cancelled all running ships-sync progress entries');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Successfully cleaned up all ships-sync locks and cancelled running syncs'
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
