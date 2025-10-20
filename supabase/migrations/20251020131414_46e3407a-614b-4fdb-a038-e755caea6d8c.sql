-- Create news table
CREATE TABLE public.news (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  excerpt text,
  content_md text,
  category text NOT NULL CHECK (category IN ('Update', 'Feature', 'Sale', 'Event', 'Tech', 'Community')),
  image_url text,
  source_url text NOT NULL,
  published_at timestamptz NOT NULL,
  hash text NOT NULL UNIQUE,
  source jsonb NOT NULL DEFAULT '{"source": "rsi", "url": "", "ts": ""}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Create index
CREATE INDEX idx_news_published_at ON public.news(published_at DESC);
CREATE INDEX idx_news_category ON public.news(category);

-- Policy: Public read access
CREATE POLICY "news_read_public" ON public.news
  FOR SELECT
  USING (true);

-- Policy: Admin write access
CREATE POLICY "news_admin_write" ON public.news
  FOR ALL
  USING (
    EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_news_updated_at
  BEFORE UPDATE ON public.news
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();