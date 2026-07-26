# Staff logins

Dashboard: https://coffee-shop-order-olive.vercel.app/dashboard

Type only the **username** (not a long email).

| Role | Username | Password | Monitor |
|------|----------|----------|---------|
| Pronari (owner) | `pronari_phm` | *your existing password* | Everything |
| Shankist 1 | `shankisti1` | `mulliri7x` | Kitchen tasks only |
| Shankist 2 | `shankisti2` | `espressoQ9` | Kitchen tasks only |
| Kamerier 1 | `kamerieri1` | `tavolina3k` | Table bills until paid |
| Kamerier 2 | `kamerieri2` | `faturaZ8` | Table bills until paid |

## How the two monitors work

### Shankist
- Each new order (QR or manual) = **one task**
- Press **Gati** when ready
- Does not care about payments or table totals

### Kamerier
- Sees **one invoice per table** for the whole visit
- Multiple rounds (order → gati → order again) **add up** on that table
- While shankist still has pending items: shows **Në punë** (no Pay)
- When all rounds are **Gati**: **Paguaj** (full table or split)
- **Paguaj** = table left → bill closes → next orders start a **fresh** visit

### Admin / Pronari
- Sees kitchen + bills + sales + team + wipe

## Reset passwords / accounts

```powershell
cd C:\Users\Rimma\coffee-shop-order
node scripts/setup-staff.mjs
```
