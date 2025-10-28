-- Add production_status column to ships table
ALTER TABLE public.ships 
ADD COLUMN production_status text;

-- Add index for better query performance on production_status
CREATE INDEX idx_ships_production_status ON public.ships(production_status);

COMMENT ON COLUMN public.ships.production_status IS 'Production status: Flight Ready, In Development, Concept, etc.';