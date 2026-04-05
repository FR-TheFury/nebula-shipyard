
-- =============================================
-- TERMINALS (locations: stations, outposts, cities, refineries)
-- =============================================
CREATE TABLE public.terminals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  type text, -- commodity, refinery, shop, clinic, cargo
  location_type text, -- space_station, outpost, city, orbital, landing_zone
  star_system text,
  planet text,
  moon text,
  space_station text,
  latitude numeric,
  longitude numeric,
  is_refinery boolean DEFAULT false,
  uex_id bigint UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Terminals are publicly readable" ON public.terminals FOR SELECT USING (true);
CREATE POLICY "Admins can manage terminals" ON public.terminals FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- COMMODITIES (resources, goods, gases, etc.)
-- =============================================
CREATE TABLE public.commodities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  code text,
  category text, -- gas, metal, mineral, agricultural, medical, food, scrap, vice, halogen, non_metals
  is_raw boolean DEFAULT false,
  is_illegal boolean DEFAULT false,
  is_harvestable boolean DEFAULT false,
  buy_price_avg numeric,
  sell_price_avg numeric,
  uex_id bigint UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.commodities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commodities are publicly readable" ON public.commodities FOR SELECT USING (true);
CREATE POLICY "Admins can manage commodities" ON public.commodities FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- COMMODITY PRICES (per terminal)
-- =============================================
CREATE TABLE public.commodity_prices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity_id bigint NOT NULL REFERENCES public.commodities(id) ON DELETE CASCADE,
  terminal_id bigint NOT NULL REFERENCES public.terminals(id) ON DELETE CASCADE,
  price_buy numeric,
  price_sell numeric,
  scu_buy integer,
  scu_sell integer,
  status text DEFAULT 'normal', -- out_of_stock, low, normal, high
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(commodity_id, terminal_id)
);

ALTER TABLE public.commodity_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commodity prices are publicly readable" ON public.commodity_prices FOR SELECT USING (true);
CREATE POLICY "Admins can manage commodity prices" ON public.commodity_prices FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- MISSIONS
-- =============================================
CREATE TABLE public.missions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  description text,
  category text, -- delivery, bounty, mercenary, salvage, mining, maintenance, investigation, escort
  mission_type text,
  faction text,
  star_system text,
  reward_auec integer,
  base_xp integer,
  is_illegal boolean DEFAULT false,
  is_shareable boolean DEFAULT false,
  is_unique boolean DEFAULT false,
  is_repeatable boolean DEFAULT true,
  is_chain boolean DEFAULT false,
  chain_length integer,
  rank_required text,
  combat_threat text,
  blueprint_reward text,
  source_id text UNIQUE, -- external ID for dedup
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Missions are publicly readable" ON public.missions FOR SELECT USING (true);
CREATE POLICY "Admins can manage missions" ON public.missions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- MINING RESOURCES (where to find raw materials)
-- =============================================
CREATE TABLE public.mining_resources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity_id bigint NOT NULL REFERENCES public.commodities(id) ON DELETE CASCADE,
  location_type text, -- asteroid, surface, subsurface, gas_cloud
  star_system text,
  planet text,
  moon text,
  concentration_pct numeric,
  rarity text, -- common, uncommon, rare, very_rare
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.mining_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mining resources are publicly readable" ON public.mining_resources FOR SELECT USING (true);
CREATE POLICY "Admins can manage mining resources" ON public.mining_resources FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- REFINERY METHODS
-- =============================================
CREATE TABLE public.refinery_methods (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  duration_modifier numeric DEFAULT 1.0,
  cost_modifier numeric DEFAULT 1.0,
  yield_modifier numeric DEFAULT 1.0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.refinery_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Refinery methods are publicly readable" ON public.refinery_methods FOR SELECT USING (true);
CREATE POLICY "Admins can manage refinery methods" ON public.refinery_methods FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- REFINERY YIELDS (commodity + method + terminal = yield)
-- =============================================
CREATE TABLE public.refinery_yields (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity_id bigint NOT NULL REFERENCES public.commodities(id) ON DELETE CASCADE,
  method_id bigint NOT NULL REFERENCES public.refinery_methods(id) ON DELETE CASCADE,
  terminal_id bigint REFERENCES public.terminals(id) ON DELETE SET NULL,
  yield_pct numeric,
  duration_seconds integer,
  cost_auec integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.refinery_yields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Refinery yields are publicly readable" ON public.refinery_yields FOR SELECT USING (true);
CREATE POLICY "Admins can manage refinery yields" ON public.refinery_yields FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- GAME ITEMS (weapons, armor, components, food, etc.)
-- =============================================
CREATE TABLE public.game_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text, -- weapon, armor, component, food, drink, medical, utility
  sub_category text,
  manufacturer text,
  size text,
  grade text,
  buy_price_avg numeric,
  sell_price_avg numeric,
  uuid text UNIQUE, -- game file UUID
  uex_id bigint UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.game_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game items are publicly readable" ON public.game_items FOR SELECT USING (true);
CREATE POLICY "Admins can manage game items" ON public.game_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- INDEXES for performance
-- =============================================
CREATE INDEX idx_terminals_star_system ON public.terminals(star_system);
CREATE INDEX idx_terminals_type ON public.terminals(type);
CREATE INDEX idx_commodities_category ON public.commodities(category);
CREATE INDEX idx_commodity_prices_commodity ON public.commodity_prices(commodity_id);
CREATE INDEX idx_commodity_prices_terminal ON public.commodity_prices(terminal_id);
CREATE INDEX idx_missions_category ON public.missions(category);
CREATE INDEX idx_missions_star_system ON public.missions(star_system);
CREATE INDEX idx_missions_faction ON public.missions(faction);
CREATE INDEX idx_mining_resources_commodity ON public.mining_resources(commodity_id);
CREATE INDEX idx_mining_resources_star_system ON public.mining_resources(star_system);
CREATE INDEX idx_game_items_category ON public.game_items(category);
CREATE INDEX idx_game_items_manufacturer ON public.game_items(manufacturer);
