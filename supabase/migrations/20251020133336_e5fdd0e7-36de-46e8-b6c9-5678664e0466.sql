-- Add model_glb_url column to ships table for 3D models
ALTER TABLE ships ADD COLUMN IF NOT EXISTS model_glb_url TEXT;

-- Add index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_ships_slug ON ships(slug);

-- Add indexes for common filters
CREATE INDEX IF NOT EXISTS idx_ships_manufacturer ON ships(manufacturer);
CREATE INDEX IF NOT EXISTS idx_ships_role ON ships(role);
CREATE INDEX IF NOT EXISTS idx_ships_size ON ships(size);