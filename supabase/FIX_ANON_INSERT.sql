-- Ensure customers can place orders (anon insert)
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
