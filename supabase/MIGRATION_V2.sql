-- Run once in Supabase → SQL Editor → Run
-- Adds cancel/archive + staff work sessions

-- 1) Order lifecycle
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'done', 'cancelled'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_by uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS orders_archived_at_idx ON orders (archived_at);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders (status, created_at DESC);

-- 2) Staff work sessions (login → logout)
CREATE TABLE IF NOT EXISTS staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS staff_sessions_user_idx ON staff_sessions (user_id, started_at DESC);

ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;

-- Session policies must NOT subquery staff_profiles (causes infinite RLS recursion).
DROP POLICY IF EXISTS "Staff read own sessions" ON staff_sessions;
DROP POLICY IF EXISTS "Staff read sessions" ON staff_sessions;
CREATE POLICY "Staff read sessions"
  ON staff_sessions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff insert own sessions" ON staff_sessions;
CREATE POLICY "Staff insert own sessions"
  ON staff_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff update own sessions" ON staff_sessions;
CREATE POLICY "Staff update own sessions"
  ON staff_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3) Staff can delete archived orders (admin tools)
DROP POLICY IF EXISTS "Staff can delete orders" ON orders;
CREATE POLICY "Staff can delete orders"
  ON orders FOR DELETE TO authenticated
  USING (true);

-- 4) Profiles: drop recursive admin policy, allow authenticated read
DROP POLICY IF EXISTS "Staff can read own profile" ON staff_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON staff_profiles;
DROP POLICY IF EXISTS "Staff can read profiles for names" ON staff_profiles;
DROP POLICY IF EXISTS "Authenticated read staff profiles" ON staff_profiles;
CREATE POLICY "Authenticated read staff profiles"
  ON staff_profiles FOR SELECT TO authenticated
  USING (true);
