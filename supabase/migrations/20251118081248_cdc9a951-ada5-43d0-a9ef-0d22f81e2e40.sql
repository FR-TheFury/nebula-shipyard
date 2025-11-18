-- Add missing RLS policies for sync_progress table
-- This allows edge functions (using service role) to insert and update progress

-- Policy to allow service role to insert sync progress entries
CREATE POLICY "Service role can insert sync progress"
ON public.sync_progress
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy to allow service role to update sync progress entries
CREATE POLICY "Service role can update sync progress"
ON public.sync_progress
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Policy to allow service role to delete old sync progress entries
CREATE POLICY "Service role can delete sync progress"
ON public.sync_progress
FOR DELETE
TO service_role
USING (true);

-- Add comment explaining the policies
COMMENT ON TABLE public.sync_progress IS 'Tracks the progress of synchronization functions. Service role can modify, admins can view.';