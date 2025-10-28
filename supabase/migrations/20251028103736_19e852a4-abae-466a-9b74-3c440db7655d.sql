-- Schedule new ships sync every day at 4 AM
SELECT cron.schedule(
  'new-ships-daily-sync',
  '0 4 * * *', -- At 4:00 AM every day
  $$
  SELECT
    net.http_post(
        url:='https://djmzthmmgjlkfgwkawzi.supabase.co/functions/v1/new-ships-sync',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbXp0aG1tZ2psa2Znd2thd3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MTE5NTUsImV4cCI6MjA3NjQ4Nzk1NX0.Nm8JhNANHuPjiRWMbvxoDObc94k5l679KGOBUHYhfew"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule server status sync every hour
SELECT cron.schedule(
  'server-status-hourly-sync',
  '0 * * * *', -- At the start of every hour
  $$
  SELECT
    net.http_post(
        url:='https://djmzthmmgjlkfgwkawzi.supabase.co/functions/v1/server-status-sync',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbXp0aG1tZ2psa2Znd2thd3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MTE5NTUsImV4cCI6MjA3NjQ4Nzk1NX0.Nm8JhNANHuPjiRWMbvxoDObc94k5l679KGOBUHYhfew"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);