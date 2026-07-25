# Si të krijosh llogari stafi (email)

## 1. Ekzekuto SQL

Në Supabase → **SQL Editor** → hap `schema.sql` nga projekti dhe **Run** (i plotë).

Kjo shton `completed_at`, `completed_by` dhe tabelën `staff_profiles`, dhe mbyll leximin e porosive vetëm për stafin e kyçur.

## 2. Krijo përdoruesin në Auth

1. Supabase → **Authentication** → **Users** → **Add user**
2. Email + fjalëkalim (p.sh. `ti@email.com`)
3. Auto Confirm User: **ON**
4. Krijo

Kopjo **User UID** (uuid).

## 3. Cakto rolin (admin ose worker)

SQL Editor:

```sql
-- ADMIN (ti)
INSERT INTO staff_profiles (id, role, display_name)
VALUES ('PASTE-USER-UUID-HERE', 'admin', 'Pronari')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- PUNËTOR
INSERT INTO staff_profiles (id, role, display_name)
VALUES ('PASTE-OTHER-UUID-HERE', 'worker', 'Emri i punëtorit')
ON CONFLICT (id) DO UPDATE SET role = 'worker';
```

## 4. Hyr në app

https://coffee-shop-order-olive.vercel.app/dashboard

- **Admin** sheh: panel live + shitjet + shpejtësinë e shërbimit  
- **Worker** sheh: vetëm porositë aktive dhe “U bë”

## Demo lokale (pa Supabase)

- Admin: `admin@demo.local` / `admin`  
- Worker: `worker@demo.local` / `worker`
