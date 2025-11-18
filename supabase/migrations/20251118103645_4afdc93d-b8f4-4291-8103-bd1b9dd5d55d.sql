-- Phase 3: Pré-assigner automatiquement tous les slugs qui matchent exactement
WITH fy_slugs AS (
  SELECT DISTINCT jsonb_array_elements(models)->>'slug' as slug
  FROM fleetyards_models_cache
  WHERE fetched_at = (SELECT MAX(fetched_at) FROM fleetyards_models_cache)
)
INSERT INTO ship_slug_mappings (wiki_title, fleetyards_slug, manual_override, created_at, updated_at)
SELECT 
  s.name as wiki_title,
  s.slug as fleetyards_slug,
  false as manual_override,
  NOW() as created_at,
  NOW() as updated_at
FROM ships s
INNER JOIN fy_slugs f ON s.slug = f.slug
ON CONFLICT (wiki_title) DO NOTHING;

-- Log results
DO $$ 
DECLARE
  total_mappings INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_mappings FROM ship_slug_mappings WHERE manual_override = false;
  RAISE NOTICE 'Total auto-mappings created: %', total_mappings;
END $$;