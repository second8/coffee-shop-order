-- Fix: allow customers (anon) to place orders again
-- Run in Supabase → SQL Editor → Run

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous inserts" ON orders;
CREATE POLICY "Allow anonymous inserts"
  ON orders FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated inserts" ON orders;
CREATE POLICY "Allow authenticated inserts"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read orders" ON orders;
DROP POLICY IF EXISTS "Staff can read orders" ON orders;
CREATE POLICY "Staff can read orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow update status" ON orders;
DROP POLICY IF EXISTS "Staff can update orders" ON orders;
CREATE POLICY "Staff can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
