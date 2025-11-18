-- Phase 4: Normaliser les types de vaisseaux existants

-- Normaliser le champ 'size' (Capital, Fighter, etc.)
UPDATE ships
SET size = INITCAP(LOWER(size))
WHERE size IS NOT NULL AND size != INITCAP(LOWER(size));

-- Normaliser le champ 'role' (Combat, Transport, etc.)
UPDATE ships
SET role = INITCAP(LOWER(role))
WHERE role IS NOT NULL AND role != INITCAP(LOWER(role));

-- Log results
DO $$ 
DECLARE
  size_count INTEGER;
  role_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT size) INTO size_count FROM ships WHERE size IS NOT NULL;
  SELECT COUNT(DISTINCT role) INTO role_count FROM ships WHERE role IS NOT NULL;
  RAISE NOTICE 'Normalized sizes: % unique values', size_count;
  RAISE NOTICE 'Normalized roles: % unique values', role_count;
END $$;