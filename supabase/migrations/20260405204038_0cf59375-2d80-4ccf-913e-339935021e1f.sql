-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;

-- Create new policy: only authenticated users can read profiles
CREATE POLICY "Profiles readable by authenticated users"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);