-- MINIMAL FIX — paste this ONLY if you still see "archived_at does not exist"
-- Supabase → SQL Editor → New query → paste → Run

ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_by uuid;

-- Allow cancelled status (ignore error if constraint name differs)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'done', 'cancelled'));
