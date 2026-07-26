-- Roles (shankist / kamerier) + payment fields
-- Run in Supabase SQL Editor if not applied yet.

-- 1) Expand staff roles
ALTER TABLE staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_role_check;
ALTER TABLE staff_profiles
  ADD CONSTRAINT staff_profiles_role_check
  CHECK (role IN ('admin', 'worker', 'barista', 'waitress'));

-- 2) Payment tracking on orders (waitress marks paid)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_by uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_events jsonb DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS orders_paid_at_idx ON orders (paid_at);
CREATE INDEX IF NOT EXISTS orders_table_open_idx
  ON orders (table_number, status, created_at DESC);

-- 3) Admin wipe helper: staff may already delete; keep policy
DROP POLICY IF EXISTS "Staff can delete orders" ON orders;
CREATE POLICY "Staff can delete orders"
  ON orders FOR DELETE TO authenticated
  USING (true);
