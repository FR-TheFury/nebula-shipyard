-- Phase 1: Extension de la base de données pour système de news enrichi

-- Ajouter colonnes pour statistiques sociales à la table news
ALTER TABLE news ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS reaction_counts JSONB DEFAULT '{"like": 0, "important": 0, "interesting": 0}'::jsonb;
ALTER TABLE news ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE news ADD COLUMN IF NOT EXISTS related_news_ids BIGINT[] DEFAULT '{}';
ALTER TABLE news ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'article';
ALTER TABLE news ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb;

-- Table pour les réactions utilisateurs
CREATE TABLE IF NOT EXISTS news_reactions (
  id BIGSERIAL PRIMARY KEY,
  news_id BIGINT REFERENCES news(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'important', 'interesting')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(news_id, user_id, reaction_type)
);

-- Table pour les vues de news (analytics)
CREATE TABLE IF NOT EXISTS news_views (
  id BIGSERIAL PRIMARY KEY,
  news_id BIGINT REFERENCES news(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT
);

-- Table pour les commentaires
CREATE TABLE IF NOT EXISTS news_comments (
  id BIGSERIAL PRIMARY KEY,
  news_id BIGINT REFERENCES news(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_news_tags ON news USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_news_priority ON news(priority DESC);
CREATE INDEX IF NOT EXISTS idx_news_media_type ON news(media_type);
CREATE INDEX IF NOT EXISTS idx_news_reactions_news_id ON news_reactions(news_id);
CREATE INDEX IF NOT EXISTS idx_news_reactions_user_id ON news_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_news_views_news_id ON news_views(news_id);
CREATE INDEX IF NOT EXISTS idx_news_views_viewed_at ON news_views(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_comments_news_id ON news_comments(news_id);

-- Fonction pour incrémenter view_count automatiquement
CREATE OR REPLACE FUNCTION increment_news_view_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE news 
  SET view_count = view_count + 1
  WHERE id = NEW.news_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_increment_view_count
AFTER INSERT ON news_views
FOR EACH ROW
EXECUTE FUNCTION increment_news_view_count();

-- Fonction pour mettre à jour updated_at sur commentaires
CREATE TRIGGER update_news_comments_updated_at
BEFORE UPDATE ON news_comments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies pour news_reactions
ALTER TABLE news_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reactions"
ON news_reactions FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can add reactions"
ON news_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reactions"
ON news_reactions FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies pour news_views
ALTER TABLE news_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can track views"
ON news_views FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view analytics"
ON news_views FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies pour news_comments
ALTER TABLE news_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments"
ON news_comments FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can comment"
ON news_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
ON news_comments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
ON news_comments FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all comments"
ON news_comments FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Activer realtime pour les nouvelles tables
ALTER PUBLICATION supabase_realtime ADD TABLE news_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE news_comments;