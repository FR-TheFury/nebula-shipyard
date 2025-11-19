-- Add validation status tracking to ship_slug_mappings
ALTER TABLE public.ship_slug_mappings
  ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS last_validation_error TEXT,
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS validation_attempts INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN public.ship_slug_mappings.validation_status IS 'Status of slug validation: pending, validated, failed, or skipped';
COMMENT ON COLUMN public.ship_slug_mappings.last_validation_error IS 'Last error message if validation failed';
COMMENT ON COLUMN public.ship_slug_mappings.last_validated_at IS 'Timestamp of last validation attempt';
COMMENT ON COLUMN public.ship_slug_mappings.validation_attempts IS 'Number of validation attempts';

-- Add index for filtering by status
CREATE INDEX IF NOT EXISTS idx_slug_mappings_validation_status 
  ON public.ship_slug_mappings(validation_status);

-- Extend sync_progress with more detailed tracking
ALTER TABLE public.sync_progress
  ADD COLUMN IF NOT EXISTS success_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_ships JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.sync_progress.success_count IS 'Number of successfully synced ships';
COMMENT ON COLUMN public.sync_progress.failed_count IS 'Number of ships that failed to sync';
COMMENT ON COLUMN public.sync_progress.skipped_count IS 'Number of ships skipped due to errors';
COMMENT ON COLUMN public.sync_progress.failed_ships IS 'Array of {slug, error} objects for failed ships';