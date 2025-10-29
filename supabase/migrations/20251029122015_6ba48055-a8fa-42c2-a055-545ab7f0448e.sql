-- Remove existing cleanup job if it exists (ignore errors if it doesn't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-news-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule cleanup job to run every day at 4:00 AM UTC
SELECT cron.schedule(
  'cleanup-old-news-daily',
  '0 4 * * *', -- Every day at 4:00 AM
  $$
  SELECT
    net.http_post(
        url:='https://djmzthmmgjlkfgwkawzi.supabase.co/functions/v1/cleanup-old-news',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbXp0aG1tZ2psa2Znd2thd3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MTE5NTUsImV4cCI6MjA3NjQ4Nzk1NX0.Nm8JhNANHuPjiRWMbvxoDObc94k5l679KGOBUHYhfew"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);