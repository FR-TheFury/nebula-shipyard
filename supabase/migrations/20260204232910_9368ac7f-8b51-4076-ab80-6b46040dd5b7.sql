-- Create ship_rumors table for tracking unannounced/in-development ships
CREATE TABLE public.ship_rumors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename TEXT NOT NULL,
  possible_name TEXT,
  possible_manufacturer TEXT,
  development_stage TEXT, -- 'whitebox', 'greybox', 'final_review', 'concepting', 'early_concept'
  ship_type TEXT, -- 'fighter', 'cargo', 'exploration', etc.
  estimated_size TEXT, -- 'small', 'medium', 'large', 'capital'
  source_type TEXT NOT NULL, -- 'monthly_report', 'datamine', 'leak', 'roadmap'
  source_url TEXT,
  source_date TIMESTAMPTZ,
  first_mentioned TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  evidence JSONB DEFAULT '[]'::jsonb, -- [{source: 'url', date: '', excerpt: ''}]
  confirmed_ship_id BIGINT REFERENCES ships(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX idx_ship_rumors_source_type ON public.ship_rumors(source_type);
CREATE INDEX idx_ship_rumors_development_stage ON public.ship_rumors(development_stage);
CREATE INDEX idx_ship_rumors_is_active ON public.ship_rumors(is_active);
CREATE INDEX idx_ship_rumors_last_updated ON public.ship_rumors(last_updated DESC);

-- Enable RLS
ALTER TABLE public.ship_rumors ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Ship rumors are publicly readable" 
ON public.ship_rumors 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage ship rumors" 
ON public.ship_rumors 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage ship rumors" 
ON public.ship_rumors 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create function to update last_updated timestamp
CREATE OR REPLACE FUNCTION public.update_ship_rumors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ship_rumors_last_updated
BEFORE UPDATE ON public.ship_rumors
FOR EACH ROW
EXECUTE FUNCTION public.update_ship_rumors_updated_at();