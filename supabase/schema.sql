-- Coffee Shop Ordering System — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number integer NOT NULL,
  items jsonb NOT NULL,
  total decimal(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index for dashboard queries (today's orders by time)
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

-- 3. Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies (anonymous customers + open dashboard for v1)
DROP POLICY IF EXISTS "Allow anonymous inserts" ON orders;
CREATE POLICY "Allow anonymous inserts"
  ON orders FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read orders" ON orders;
CREATE POLICY "Allow read orders"
  ON orders FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow update status" ON orders;
CREATE POLICY "Allow update status"
  ON orders FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 5. Enable Realtime for the orders table
-- In Supabase Dashboard: Database → Publications → supabase_realtime
-- or run:
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
