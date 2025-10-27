-- Enable extensions for CRON scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create table to track CRON job execution history
CREATE TABLE IF NOT EXISTS public.cron_job_history (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  items_synced INTEGER DEFAULT 0,
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER
);

-- Enable RLS on cron_job_history
ALTER TABLE public.cron_job_history ENABLE ROW LEVEL SECURITY;

-- Admins can view CRON history
CREATE POLICY "Admins can view cron history"
  ON public.cron_job_history FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Schedule news sync every 2 hours
SELECT cron.schedule(
  'auto-sync-news',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://djmzthmmgjlkfgwkawzi.supabase.co/functions/v1/news-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbXp0aG1tZ2psa2Znd2thd3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MTE5NTUsImV4cCI6MjA3NjQ4Nzk1NX0.Nm8JhNANHuPjiRWMbvxoDObc94k5l679KGOBUHYhfew'
    ),
    body := jsonb_build_object('auto_sync', true, 'triggered_at', now()),
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);

-- Schedule ships sync every 6 hours
SELECT cron.schedule(
  'auto-sync-ships',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://djmzthmmgjlkfgwkawzi.supabase.co/functions/v1/ships-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbXp0aG1tZ2psa2Znd2thd3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MTE5NTUsImV4cCI6MjA3NjQ4Nzk1NX0.Nm8JhNANHuPjiRWMbvxoDObc94k5l679KGOBUHYhfew'
    ),
    body := jsonb_build_object('auto_sync', true, 'triggered_at', now()),
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);