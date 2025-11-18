-- Add fleetyards_slug_used column to ships table
ALTER TABLE public.ships 
ADD COLUMN IF NOT EXISTS fleetyards_slug_used text;

-- Add comment to explain the column
COMMENT ON COLUMN public.ships.fleetyards_slug_used IS 'The FleetYards slug that was used to fetch data for this ship (either auto-mapped or manual override)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ships_fleetyards_slug_used ON public.ships(fleetyards_slug_used);