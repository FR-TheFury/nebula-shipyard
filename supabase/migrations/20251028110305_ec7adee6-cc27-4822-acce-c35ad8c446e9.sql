-- Add flight_ready_since column to track when a ship became flight ready
ALTER TABLE public.ships 
ADD COLUMN flight_ready_since timestamp with time zone;

-- Add index for better query performance
CREATE INDEX idx_ships_flight_ready_since ON public.ships(flight_ready_since) WHERE flight_ready_since IS NOT NULL;

COMMENT ON COLUMN public.ships.flight_ready_since IS 'Timestamp when the ship first became flight ready. Used to detect new flight ready ships.';