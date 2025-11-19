-- Create RPC function to cleanup zombie sync jobs
CREATE OR REPLACE FUNCTION public.cleanup_zombie_sync_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cancelled_count INTEGER;
  v_deleted_locks_count INTEGER;
BEGIN
  -- Cancel stuck sync_progress entries (running for more than 1 hour)
  UPDATE sync_progress
  SET 
    status = 'cancelled',
    completed_at = NOW(),
    error_message = 'Cancelled due to timeout (zombie instance)',
    updated_at = NOW()
  WHERE status = 'running'
    AND started_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;
  
  -- Delete expired locks
  DELETE FROM edge_function_locks
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS v_deleted_locks_count = ROW_COUNT;
  
  -- Log the cleanup
  INSERT INTO audit_logs (action, meta)
  VALUES (
    'cleanup_zombie_sync_jobs',
    jsonb_build_object(
      'cancelled_syncs', v_cancelled_count,
      'deleted_locks', v_deleted_locks_count,
      'timestamp', NOW()
    )
  );
  
  RAISE NOTICE 'Cleanup completed: % sync jobs cancelled, % locks deleted', v_cancelled_count, v_deleted_locks_count;
END;
$$;