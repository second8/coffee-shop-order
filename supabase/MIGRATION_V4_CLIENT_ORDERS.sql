-- Client / office sticker orders (loyal clients)
-- Safe to re-run in Supabase SQL Editor

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_name text;

-- Allow table_number = 0 for client/office destinations
-- (existing rows stay 1+)
COMMENT ON COLUMN orders.client_name IS
  'Named office/client sticker. When set, table_number is 0 and delivery is to this name.';

CREATE INDEX IF NOT EXISTS orders_client_name_idx
  ON orders (client_name)
  WHERE client_name IS NOT NULL;
