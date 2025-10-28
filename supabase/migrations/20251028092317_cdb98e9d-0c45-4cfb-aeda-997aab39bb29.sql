-- Add video and gif support to gallery posts
ALTER TABLE public.gallery_posts
ADD COLUMN video_url text,
ADD COLUMN gif_url text;