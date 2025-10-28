-- Schedule cleanup of old news every day at 3 AM
SELECT cron.schedule(
  'cleanup-old-news-daily',
  '0 3 * * *', -- At 3:00 AM every day
  $$
  SELECT
    net.http_post(
        url:='https://djmzthmmgjlkfgwkawzi.supabase.co/functions/v1/cleanup-old-news',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbXp0aG1tZ2psa2Znd2thd3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MTE5NTUsImV4cCI6MjA3NjQ4Nzk1NX0.Nm8JhNANHuPjiRWMbvxoDObc94k5l679KGOBUHYhfew"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);