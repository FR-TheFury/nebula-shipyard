-- Add approval field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN approved BOOLEAN NOT NULL DEFAULT false;

-- Add approved_at timestamp
ALTER TABLE public.profiles 
ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;

-- Add approved_by to track which admin approved
ALTER TABLE public.profiles 
ADD COLUMN approved_by UUID REFERENCES auth.users(id);

-- Create index for faster queries on approval status
CREATE INDEX idx_profiles_approved ON public.profiles(approved);

-- Update existing users to be approved (so they don't get locked out)
UPDATE public.profiles SET approved = true WHERE approved = false;

-- Create function to approve a user (only admins can call this)
CREATE OR REPLACE FUNCTION public.approve_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can approve users';
  END IF;
  
  -- Approve the user
  UPDATE public.profiles
  SET 
    approved = true,
    approved_at = now(),
    approved_by = auth.uid()
  WHERE id = target_user_id;
END;
$$;