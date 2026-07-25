-- FIX CANCEL — run this in Supabase SQL Editor (all of it, then Run)
-- Fixes: violates check constraint "orders_status_check"

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'done', 'cancelled'));

-- Also add archive columns if still missing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_by uuid;
