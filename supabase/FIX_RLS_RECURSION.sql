-- FIX: infinite recursion on staff_profiles / staff_sessions
-- Run once in Supabase → SQL Editor → Run
-- Symptom: team names missing, sessions empty, errors like:
--   "infinite recursion detected in policy for relation staff_profiles"

-- 1) staff_profiles: simple policies (no self-subquery)
DROP POLICY IF EXISTS "Staff can read own profile" ON staff_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON staff_profiles;
DROP POLICY IF EXISTS "Staff can read profiles for names" ON staff_profiles;
DROP POLICY IF EXISTS "Authenticated read staff profiles" ON staff_profiles;

CREATE POLICY "Authenticated read staff profiles"
  ON staff_profiles FOR SELECT TO authenticated
  USING (true);

-- 2) staff_sessions: do NOT query staff_profiles (that caused recursion)
DROP POLICY IF EXISTS "Staff read own sessions" ON staff_sessions;
DROP POLICY IF EXISTS "Staff read sessions" ON staff_sessions;
DROP POLICY IF EXISTS "Staff insert own sessions" ON staff_sessions;
DROP POLICY IF EXISTS "Staff update own sessions" ON staff_sessions;

-- All logged-in staff can read sessions (UI shows team only to admin)
CREATE POLICY "Staff read sessions"
  ON staff_sessions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff insert own sessions"
  ON staff_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff update own sessions"
  ON staff_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3) Ensure V2 columns/constraints exist (safe to re-run)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'done', 'cancelled'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_by uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS note text;

CREATE TABLE IF NOT EXISTS staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can delete orders" ON orders;
CREATE POLICY "Staff can delete orders"
  ON orders FOR DELETE TO authenticated
  USING (true);
