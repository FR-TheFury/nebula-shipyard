-- Delete all existing ship rumors from the first sync
DELETE FROM public.ship_rumors WHERE is_active = true;

-- Also clean up any inactive ones
DELETE FROM public.ship_rumors;