-- Add systems column to ships table for storing avionics, propulsion, thrusters, and power systems
ALTER TABLE public.ships ADD COLUMN IF NOT EXISTS systems jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ships.systems IS 'Stores ship systems data including avionics, propulsion, thrusters, and power systems';