-- Add service role policy for ships table to allow edge functions to write
CREATE POLICY "Service role can manage ships"
ON public.ships
FOR ALL
USING (true)
WITH CHECK (true);

-- Ensure fleetyards_cache has proper service role access
DROP POLICY IF EXISTS "Service role can manage cache" ON public.fleetyards_cache;
CREATE POLICY "Service role can manage cache"
ON public.fleetyards_cache
FOR ALL
USING (true)
WITH CHECK (true);

-- Add comments for clarity
COMMENT ON POLICY "Service role can manage ships" ON public.ships IS 
'Allows edge functions using service role to manage ship data during sync operations';

COMMENT ON POLICY "Service role can manage cache" ON public.fleetyards_cache IS 
'Allows edge functions using service role to manage FleetYards cache during sync operations';