-- Phase 1: Database Setup with Secure Role System

-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('user', 'admin');

-- 2. Create user_roles table (CRITICAL: roles must be separate)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

-- 3. Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- 4. Profiles table (NO role field here - security!)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  handle TEXT UNIQUE NOT NULL CHECK (char_length(handle) BETWEEN 3 AND 24),
  display_name TEXT NOT NULL,
  bio_md TEXT DEFAULT '',
  avatar_url TEXT,
  stats JSONB DEFAULT jsonb_build_object(
    'space_combat', 0,
    'fps_combat', 0,
    'piloting', 0,
    'exploration', 0,
    'trading', 0,
    'mining', 0,
    'search_rescue', 0,
    'reputation', 0,
    'flight_hours', 0,
    'kd_ratio', 0.0,
    'events_completed', 0
  )
);

CREATE INDEX idx_profiles_handle ON public.profiles(handle);
CREATE INDEX idx_profiles_stats ON public.profiles USING gin(stats);

-- 5. Logs table (journal de bord)
CREATE TABLE public.logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  image_url TEXT,
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_logs_user_id_created ON public.logs(user_id, created_at DESC);
CREATE INDEX idx_logs_tags ON public.logs USING gin(tags);

-- 6. Gallery tables
CREATE TABLE public.gallery_posts (
  id BIGSERIAL PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  title TEXT NOT NULL,
  description_md TEXT DEFAULT '',
  location TEXT,
  tags TEXT[] DEFAULT '{}'
);

CREATE TABLE public.gallery_images (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES public.gallery_posts(id) ON DELETE CASCADE,
  idx INT NOT NULL CHECK (idx BETWEEN 0 AND 9),
  image_url TEXT NOT NULL,
  UNIQUE(post_id, idx)
);

CREATE INDEX idx_gallery_posts_created ON public.gallery_posts(created_at DESC);
CREATE INDEX idx_gallery_posts_tags ON public.gallery_posts USING gin(tags);
CREATE INDEX idx_gallery_images_post_id ON public.gallery_images(post_id);

-- 7. Ships table
CREATE TABLE public.ships (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  manufacturer TEXT,
  role TEXT,
  size TEXT,
  crew_min INT,
  crew_max INT,
  cargo_scu NUMERIC,
  length_m NUMERIC,
  beam_m NUMERIC,
  height_m NUMERIC,
  scm_speed NUMERIC,
  max_speed NUMERIC,
  armament JSONB DEFAULT '{}'::jsonb,
  prices JSONB DEFAULT '[]'::jsonb,
  patch TEXT,
  source JSONB NOT NULL,
  hash TEXT NOT NULL,
  image_url TEXT,
  model_glb_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ships_manufacturer ON public.ships(manufacturer);
CREATE INDEX idx_ships_role ON public.ships(role);
CREATE INDEX idx_ships_updated ON public.ships(updated_at DESC);
CREATE UNIQUE INDEX idx_ships_hash ON public.ships(hash);

-- 8. Audit logs
CREATE TABLE public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ DEFAULT now(),
  actor UUID,
  action TEXT NOT NULL,
  target TEXT,
  meta JSONB
);

CREATE INDEX idx_audit_logs_at ON public.audit_logs(at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor);

-- 9. Materialized view for active users (search suggestions)
CREATE MATERIALIZED VIEW public.active_users_30d AS
SELECT 
  p.id,
  p.handle,
  p.display_name,
  p.avatar_url,
  COUNT(l.*) AS posts_30d,
  MAX(l.created_at) AS last_post
FROM public.profiles p
LEFT JOIN public.logs l ON l.user_id = p.id AND l.created_at > now() - INTERVAL '30 days'
GROUP BY p.id, p.handle, p.display_name, p.avatar_url
ORDER BY posts_30d DESC NULLS LAST;

CREATE INDEX idx_active_users_posts ON public.active_users_30d(posts_30d DESC);

-- 10. Function to refresh materialized view
CREATE OR REPLACE FUNCTION public.refresh_active_users_30d()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.active_users_30d;
END;
$$;

-- 11. Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, handle, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'handle', 'user_' || substring(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Citizen')
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 12. Trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_logs_updated_at
  BEFORE UPDATE ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gallery_posts_updated_at
  BEFORE UPDATE ON public.gallery_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 13. Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 14. RLS Policies - user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 15. RLS Policies - profiles
CREATE POLICY "Profiles are publicly readable"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 16. RLS Policies - logs
CREATE POLICY "Logs are publicly readable"
  ON public.logs FOR SELECT
  USING (true);

CREATE POLICY "Users can manage own logs"
  ON public.logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all logs"
  ON public.logs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 17. RLS Policies - gallery
CREATE POLICY "Gallery posts are publicly readable"
  ON public.gallery_posts FOR SELECT
  USING (true);

CREATE POLICY "Gallery images are publicly readable"
  ON public.gallery_images FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage gallery posts"
  ON public.gallery_posts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage gallery images"
  ON public.gallery_images FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 18. RLS Policies - ships
CREATE POLICY "Ships are publicly readable"
  ON public.ships FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage ships"
  ON public.ships FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 19. RLS Policies - audit_logs
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- 20. Storage buckets setup
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES 
  ('avatars', 'avatars', true, 2097152),
  ('posts', 'posts', true, 2097152),
  ('gallery', 'gallery', true, 2097152)
ON CONFLICT (id) DO NOTHING;

-- 21. Storage policies - avatars
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 22. Storage policies - posts
CREATE POLICY "Post images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'posts');

CREATE POLICY "Users can upload own post images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'posts' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own post images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'posts' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 23. Storage policies - gallery
CREATE POLICY "Gallery images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gallery');

CREATE POLICY "Admins can manage gallery images"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'gallery' 
    AND public.has_role(auth.uid(), 'admin')
  );