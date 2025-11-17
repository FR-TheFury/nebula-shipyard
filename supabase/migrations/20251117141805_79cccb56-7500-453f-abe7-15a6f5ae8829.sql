-- Create table to track sync progress
CREATE TABLE IF NOT EXISTS public.sync_progress (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  current_item INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  current_ship_name TEXT,
  current_ship_slug TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_sync_progress_function_status ON public.sync_progress(function_name, status);
CREATE INDEX idx_sync_progress_started_at ON public.sync_progress(started_at DESC);

-- Enable RLS
ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;

-- Admin can view all sync progress
CREATE POLICY "Admins can view sync progress"
  ON public.sync_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Create function to get latest sync progress
CREATE OR REPLACE FUNCTION public.get_latest_sync_progress(p_function_name TEXT)
RETURNS TABLE (
  id BIGINT,
  function_name TEXT,
  status TEXT,
  current_item INTEGER,
  total_items INTEGER,
  current_ship_name TEXT,
  current_ship_slug TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  progress_percent NUMERIC
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    sp.id,
    sp.function_name,
    sp.status,
    sp.current_item,
    sp.total_items,
    sp.current_ship_name,
    sp.current_ship_slug,
    sp.started_at,
    sp.updated_at,
    sp.completed_at,
    sp.duration_ms,
    sp.error_message,
    sp.metadata,
    CASE 
      WHEN sp.total_items > 0 THEN ROUND((sp.current_item::NUMERIC / sp.total_items::NUMERIC) * 100, 2)
      ELSE 0
    END as progress_percent
  FROM public.sync_progress sp
  WHERE sp.function_name = p_function_name
  ORDER BY sp.started_at DESC
  LIMIT 1;
$$;