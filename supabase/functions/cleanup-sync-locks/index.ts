import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🧹 Cleanup sync locks function invoked');

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 1. Delete expired locks (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: expiredLocks, error: deleteLockError } = await supabaseAdmin
      .from('edge_function_locks')
      .delete()
      .lt('expires_at', oneHourAgo)
      .select();

    if (deleteLockError) {
      console.error('Failed to delete expired locks:', deleteLockError);
      throw deleteLockError;
    }

    console.log(`✅ Deleted ${expiredLocks?.length || 0} expired locks`);

    // 2. Find and cancel stuck sync_progress entries (running for > 1 hour)
    const { data: stuckSyncs, error: selectError } = await supabaseAdmin
      .from('sync_progress')
      .select('id, function_name, started_at')
      .eq('status', 'running')
      .lt('started_at', oneHourAgo);

    if (selectError) {
      console.error('Failed to query stuck syncs:', selectError);
      throw selectError;
    }

    if (stuckSyncs && stuckSyncs.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('sync_progress')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: 'Cancelled by cleanup job - sync exceeded 1 hour timeout'
        })
        .in('id', stuckSyncs.map(s => s.id));

      if (updateError) {
        console.error('Failed to cancel stuck syncs:', updateError);
        throw updateError;
      }

      console.log(`✅ Cancelled ${stuckSyncs.length} stuck sync_progress entries`);
    }

    // 3. Delete old sync_progress entries (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: oldSyncs, error: deleteOldError } = await supabaseAdmin
      .from('sync_progress')
      .delete()
      .lt('created_at', sevenDaysAgo)
      .select('id');

    if (deleteOldError) {
      console.error('Failed to delete old sync_progress:', deleteOldError);
      throw deleteOldError;
    }

    console.log(`✅ Deleted ${oldSyncs?.length || 0} old sync_progress entries`);

    // Log audit trail
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        action: 'cleanup_sync_locks',
        actor: 'system',
        target: 'edge_function_locks',
        meta: {
          expired_locks_deleted: expiredLocks?.length || 0,
          stuck_syncs_cancelled: stuckSyncs?.length || 0,
          old_syncs_deleted: oldSyncs?.length || 0
        }
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cleanup completed successfully',
        stats: {
          expired_locks_deleted: expiredLocks?.length || 0,
          stuck_syncs_cancelled: stuckSyncs?.length || 0,
          old_syncs_deleted: oldSyncs?.length || 0
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in cleanup-sync-locks:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
