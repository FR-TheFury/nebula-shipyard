-- Enable Realtime for sync_progress table
ALTER TABLE public.sync_progress REPLICA IDENTITY FULL;

-- Add the table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_progress;

-- Add comment to explain the Realtime configuration
COMMENT ON TABLE public.sync_progress IS 'Tracks the progress of synchronization functions. Service role can modify, admins can view. Realtime enabled for live progress updates.';