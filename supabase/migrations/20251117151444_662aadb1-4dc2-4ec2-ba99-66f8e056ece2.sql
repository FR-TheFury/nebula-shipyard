-- Create ship_slug_mappings table for manual overrides
CREATE TABLE IF NOT EXISTS public.ship_slug_mappings (
  wiki_title TEXT PRIMARY KEY,
  fleetyards_slug TEXT NOT NULL,
  manual_override BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ship_slug_mappings ENABLE ROW LEVEL SECURITY;

-- Admins can manage mappings
CREATE POLICY "Admins can manage slug mappings"
ON public.ship_slug_mappings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Mappings are publicly readable
CREATE POLICY "Slug mappings are publicly readable"
ON public.ship_slug_mappings
FOR SELECT
USING (true);

-- Create fleetyards_models_cache table
CREATE TABLE IF NOT EXISTS public.fleetyards_models_cache (
  id BIGSERIAL PRIMARY KEY,
  models JSONB NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '1 day')
);

-- Enable RLS
ALTER TABLE public.fleetyards_models_cache ENABLE ROW LEVEL SECURITY;

-- Service role can manage cache
CREATE POLICY "Service role can manage models cache"
ON public.fleetyards_models_cache
FOR ALL
USING (true)
WITH CHECK (true);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fleetyards_models_cache_expires ON public.fleetyards_models_cache(expires_at);