ALTER TABLE public.market_items ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '[]'::jsonb;
