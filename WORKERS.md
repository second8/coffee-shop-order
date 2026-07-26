# Staff logins (simple usernames)

Dashboard: https://coffee-shop-order-olive.vercel.app/dashboard

Type only the **username** (not a full email).

| Role | Username | Password | Monitor |
|------|----------|----------|---------|
| Admin / Pronari | your email or `admin` if set | your password | Full |
| Shankist 1 | `shankisti1` | `kafe11` | Kitchen only |
| Shankist 2 | `shankisti2` | `kafe22` | Kitchen only |
| Kamerier 1 | `kamerieri1` | `fature11` | Bills / pay |
| Kamerier 2 | `kamerieri2` | `fature22` | Bills / pay |

Behind the scenes emails are `username@pristinamuffins.local`.

## Two monitors

1. **Shanku** — log in as `shankisti1` or `shankisti2`  
   Sees only orders to prepare → **Gati**
2. **Kamerieri** — log in as `kamerieri1` or `kamerieri2`  
   Sees open bills until **E paguar** / split pay  
   Manual order merges into the same table’s open bill

## Setup / reset accounts

```powershell
cd C:\Users\Rimma\coffee-shop-order
node scripts/setup-staff.mjs
```

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

Also run once in SQL Editor: `supabase/MIGRATION_V3_ROLES_PAY.sql`

# Tables & QR

`https://coffee-shop-order-olive.vercel.app/order?table=1` … `30`  
Print: https://coffee-shop-order-olive.vercel.app/qr
