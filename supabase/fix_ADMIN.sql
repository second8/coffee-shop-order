-- Make yourself admin by EMAIL (easiest — no UUID copy)
-- 1. Replace the email below with the exact email you use to log in
-- 2. Run in Supabase → SQL Editor

INSERT INTO staff_profiles (id, role, display_name)
SELECT id, 'admin', 'Pronari'
FROM auth.users
WHERE lower(email) = lower('YOUR_EMAIL_HERE@example.com')
ON CONFLICT (id) DO UPDATE
SET role = 'admin',
    display_name = EXCLUDED.display_name;

-- Check result:
SELECT u.email, sp.role, sp.display_name, sp.id
FROM staff_profiles sp
JOIN auth.users u ON u.id = sp.id;
