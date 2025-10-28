-- Update news category constraint to include new categories
ALTER TABLE news DROP CONSTRAINT IF EXISTS news_category_check;

ALTER TABLE news ADD CONSTRAINT news_category_check 
  CHECK (category IN ('Update', 'Feature', 'New Ships', 'Server Status'));