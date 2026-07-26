-- Pristina Homemade Muffins — ordering system schema
-- Run in Supabase SQL Editor (full script is safe to re-run)

-- 1. Orders
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number integer NOT NULL,
  items jsonb NOT NULL,
  total decimal(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id)
);

-- Add columns if table already existed from v1
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

-- 2. Staff profiles (role: admin | worker)
CREATE TABLE IF NOT EXISTS staff_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'worker')),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

-- Avoid recursive policies (subquery on staff_profiles inside staff_profiles RLS).
DROP POLICY IF EXISTS "Staff can read own profile" ON staff_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON staff_profiles;
DROP POLICY IF EXISTS "Staff can read profiles for names" ON staff_profiles;
DROP POLICY IF EXISTS "Authenticated read staff profiles" ON staff_profiles;
CREATE POLICY "Authenticated read staff profiles"
  ON staff_profiles FOR SELECT
  TO authenticated
  USING (true);

-- 3. Orders RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Customers (no login): insert only
DROP POLICY IF EXISTS "Allow anonymous inserts" ON orders;
CREATE POLICY "Allow anonymous inserts"
  ON orders FOR INSERT
  TO anon
  WITH CHECK (true);

-- Also allow authenticated insert (edge cases)
DROP POLICY IF EXISTS "Allow authenticated inserts" ON orders;
CREATE POLICY "Allow authenticated inserts"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Staff only: read
DROP POLICY IF EXISTS "Allow read orders" ON orders;
DROP POLICY IF EXISTS "Staff can read orders" ON orders;
CREATE POLICY "Staff can read orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

-- Staff only: update (mark done)
DROP POLICY IF EXISTS "Allow update status" ON orders;
DROP POLICY IF EXISTS "Staff can update orders" ON orders;
CREATE POLICY "Staff can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
