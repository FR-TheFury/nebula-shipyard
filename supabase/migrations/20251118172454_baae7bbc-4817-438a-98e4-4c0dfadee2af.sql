-- Add JSONB columns for FleetYards enriched data
ALTER TABLE public.ships 
  ADD COLUMN IF NOT EXISTS fleetyards_images JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fleetyards_videos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fleetyards_loaners JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fleetyards_variants JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fleetyards_modules JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fleetyards_snub_crafts JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fleetyards_full_data JSONB DEFAULT NULL;

-- Add documentation comments
COMMENT ON COLUMN public.ships.fleetyards_images IS 'Array of image URLs from FleetYards API /models/{slug}/images';
COMMENT ON COLUMN public.ships.fleetyards_videos IS 'Array of video URLs from FleetYards API /models/{slug}/videos';
COMMENT ON COLUMN public.ships.fleetyards_loaners IS 'Array of loaner ships from FleetYards API /models/{slug}/loaners';
COMMENT ON COLUMN public.ships.fleetyards_variants IS 'Array of ship variants from FleetYards API /models/{slug}/variants';
COMMENT ON COLUMN public.ships.fleetyards_modules IS 'Array of modules from FleetYards API /models/{slug}/modules';
COMMENT ON COLUMN public.ships.fleetyards_snub_crafts IS 'Array of snub crafts from FleetYards API /models/{slug}/snub-crafts';
COMMENT ON COLUMN public.ships.fleetyards_full_data IS 'Complete ship data from FleetYards API /models/{slug}';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ships_has_images 
  ON public.ships((jsonb_array_length(fleetyards_images) > 0));
  
CREATE INDEX IF NOT EXISTS idx_ships_has_videos 
  ON public.ships((jsonb_array_length(fleetyards_videos) > 0));
  
CREATE INDEX IF NOT EXISTS idx_ships_has_loaners 
  ON public.ships((jsonb_array_length(fleetyards_loaners) > 0));