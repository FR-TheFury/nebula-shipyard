-- Create server_status table
CREATE TABLE IF NOT EXISTS public.server_status (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  hash text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  content_md text,
  status text NOT NULL CHECK (status IN ('operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  category text NOT NULL DEFAULT 'Server Status',
  published_at timestamptz NOT NULL,
  source jsonb NOT NULL DEFAULT '{"source": "rsi", "url": "", "ts": ""}',
  source_url text NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_server_status_published_at ON public.server_status(published_at DESC);
CREATE INDEX idx_server_status_status ON public.server_status(status);
CREATE INDEX idx_server_status_hash ON public.server_status(hash);

-- Enable RLS
ALTER TABLE public.server_status ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Server status is publicly readable"
  ON public.server_status
  FOR SELECT
  USING (true);

-- Admin write access
CREATE POLICY "Admins can manage server status"
  ON public.server_status
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_server_status_updated_at
  BEFORE UPDATE ON public.server_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Modify news table to support "New Ships" category
-- No changes needed, the category field already supports any text value

COMMENT ON TABLE public.server_status IS 'Stores Star Citizen server status and maintenance information';