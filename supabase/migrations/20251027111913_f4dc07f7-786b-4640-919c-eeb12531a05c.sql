-- Function to delete news older than 30 days
CREATE OR REPLACE FUNCTION public.delete_old_news()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.news
  WHERE published_at < (NOW() - INTERVAL '30 days');
END;
$function$;

-- Schedule cron job to run daily at midnight
SELECT cron.schedule(
  'delete-old-news-daily',
  '0 0 * * *', -- every day at midnight
  $$
  SELECT public.delete_old_news();
  $$
);