-- Create FleetYards cache table
CREATE TABLE IF NOT EXISTS public.fleetyards_cache (
  id BIGSERIAL PRIMARY KEY,
  ship_slug TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleetyards_cache_slug ON public.fleetyards_cache(ship_slug);
CREATE INDEX IF NOT EXISTS idx_fleetyards_cache_expires ON public.fleetyards_cache(expires_at);

-- Enable RLS
ALTER TABLE public.fleetyards_cache ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage cache
CREATE POLICY "Service role can manage cache"
ON public.fleetyards_cache
FOR ALL
USING (true)
WITH CHECK (true);

-- Extend ships table with raw data and sources tracking
ALTER TABLE public.ships 
ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '{
  "wiki": {"has_data": false, "last_fetch": null},
  "fleetyards": {"has_data": false, "last_fetch": null},
  "starcitizen_api": {"has_data": false, "last_fetch": null}
}'::jsonb;

ALTER TABLE public.ships 
ADD COLUMN IF NOT EXISTS raw_wiki_data JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS raw_fleetyards_data JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS raw_starcitizen_api_data JSONB DEFAULT NULL;

-- Create ship data preferences table
CREATE TABLE IF NOT EXISTS public.ship_data_preferences (
  ship_slug TEXT PRIMARY KEY REFERENCES public.ships(slug) ON DELETE CASCADE,
  preferred_source TEXT NOT NULL CHECK (preferred_source IN ('wiki', 'fleetyards', 'auto')),
  set_by UUID,
  set_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);

-- Enable RLS
ALTER TABLE public.ship_data_preferences ENABLE ROW LEVEL SECURITY;

-- Admins can manage preferences
CREATE POLICY "Admins can manage preferences"
ON public.ship_data_preferences
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can view preferences
CREATE POLICY "Preferences are readable"
ON public.ship_data_preferences
FOR SELECT
USING (true);