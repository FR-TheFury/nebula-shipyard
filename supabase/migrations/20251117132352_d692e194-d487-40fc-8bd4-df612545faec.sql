-- Create a table to manage edge function execution locks
CREATE TABLE IF NOT EXISTS public.edge_function_locks (
  function_name TEXT PRIMARY KEY,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enable RLS
ALTER TABLE public.edge_function_locks ENABLE ROW LEVEL SECURITY;

-- Allow edge functions to manage locks
CREATE POLICY "Allow service role to manage locks"
ON public.edge_function_locks
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_edge_function_locks_expires_at 
ON public.edge_function_locks(expires_at);

-- Function to acquire a lock
CREATE OR REPLACE FUNCTION public.acquire_function_lock(
  p_function_name TEXT,
  p_lock_duration_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_expires_at TIMESTAMP WITH TIME ZONE := v_now + (p_lock_duration_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Try to insert a new lock
  INSERT INTO public.edge_function_locks (function_name, locked_at, expires_at)
  VALUES (p_function_name, v_now, v_expires_at)
  ON CONFLICT (function_name) DO UPDATE
  SET 
    locked_at = v_now,
    expires_at = v_expires_at
  WHERE edge_function_locks.expires_at < v_now;
  
  -- Check if we got the lock
  RETURN FOUND;
END;
$$;

-- Function to release a lock
CREATE OR REPLACE FUNCTION public.release_function_lock(p_function_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.edge_function_locks 
  WHERE function_name = p_function_name;
END;
$$;