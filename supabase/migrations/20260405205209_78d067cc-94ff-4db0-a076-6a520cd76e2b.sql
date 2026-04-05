-- Drop misconfigured "service role" policies that actually grant public write access
-- The actual Supabase service_role bypasses RLS automatically, no explicit policy needed

DROP POLICY IF EXISTS "Service role can manage ships" ON public.ships;
DROP POLICY IF EXISTS "Service role can manage cache" ON public.fleetyards_cache;
DROP POLICY IF EXISTS "Service role can manage models cache" ON public.fleetyards_models_cache;
DROP POLICY IF EXISTS "Allow service role to manage locks" ON public.edge_function_locks;

-- Fix ship_rumors trigger function missing search_path
CREATE OR REPLACE FUNCTION public.update_ship_rumors_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = 'public'
AS $function$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$function$;