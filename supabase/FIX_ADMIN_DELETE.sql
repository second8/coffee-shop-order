-- Admin-only hard delete of orders (staff can no longer wipe everything)
DROP POLICY IF EXISTS "Staff can delete orders" ON orders;

CREATE POLICY "Admin can delete orders"
  ON orders FOR DELETE TO authenticated
  USING (
    COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'role'),
      (auth.jwt() -> 'user_metadata' ->> 'role')
    ) = 'admin'
    OR EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'admin'
    )
  );
