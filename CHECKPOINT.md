# Restore point — coffee-shop-order

**Primary savepoint (use this first if branding goes wrong):**

| | |
|--|--|
| **Date** | 2026-07-27 |
| **Git tag** | `checkpoint-stable-v2` (alias: `checkpoint-pre-branding`) |
| **Commit** | *(see tag — set at create time)* |
| **PC** | This machine: `C:\Users\38349\Documents\coffee-shop-order` |
| **Live** | https://coffee-shop-order-olive.vercel.app/ |
| **GitHub** | https://github.com/second8/coffee-shop-order |
| **Branch** | `main` |
| **Supabase** | `xdqigvsgmutjimzddwqi` |

**Older savepoint:** tag `checkpoint-stable-v1` (pre-Swiss restore era, 2026-07-26). Prefer **v2** unless you need that older UI intentionally.

If something breaks after branding / design changes, use this file + the git tag to go back.

---

## What’s frozen in checkpoint-stable-v2

Everything that was on `main` at end of multi-PC handoff (evening 2026-07-26) plus this doc update:

- Customer QR order (Albanian UI, notes, scrollable submit)
- Staff: shankisti / kamerieri / admin (`pronari_phm`)
- Kitchen board + table bills + pay (per person + equal + paid history)
- Manual orders, cancel with reason chips, sound, priority wait
- Admin stages: new → ready → pay → completed / cancelled
- Admin wipe, sales/speed/team/archive
- Error boundary, shared menu (`shared/menu.json`), admin-only delete RLS
- Soft cool/warm staff tints (light UI)
- Warm cream palette (`#F3EFE3`), text `#332D29`, highlight `#FFA425`
- Geist body + Instrument Serif categories / logo
- **Stickers admin-only** (`Ngjitëset QR`); `/qr` redirects to dashboard
- Named **client** stickers / office orders (min €5, orange ZYRË, exact name)
- `client_name` triple-write + hardened `/api/create-order`
- Stickers list still in **localStorage** (`phm-stickers-v1`) — not yet Supabase

**Not in git (local only):** `.env` keys — restore from password manager / Vercel if missing.

---

## Staff logins (current)

| Role | Username | Password |
|------|----------|----------|
| Pronari | `pronari_phm` | *your owner password* |
| Shankist 1 | `shankisti1` | `mulliri7x` |
| Shankist 2 | `shankisti2` | `espressoQ9` |
| Kamerier 1 | `kamerieri1` | `tavolina3k` |
| Kamerier 2 | `kamerieri2` | `faturaZ8` |

Only these 5 accounts (legacy workers removed). Details: `WORKERS.md`.

---

## Supabase migrations that should be applied

Run in SQL Editor if a fresh project / missing features (safe-ish re-run):

1. `supabase/schema.sql` (base)
2. `supabase/MIGRATION_V2.sql` + `FIX_RLS_RECURSION.sql`
3. `supabase/MIGRATION_V3_ROLES_PAY.sql` (roles, paid_at, note, cancel_reason, payment_events)
4. `supabase/FIX_ADMIN_DELETE.sql` (admin-only hard delete)
5. `supabase/MIGRATION_V4_CLIENT_ORDERS.sql` (`client_name` column)

Project ref: `xdqigvsgmutjimzddwqi`

---

## How to restore CODE (if branding / deploy goes wrong)

Paths below work on **this PC**. On another PC, change the `cd` folder.

### Option A — Hard restore to v2 + redeploy (recommended after a bad branding push)

```powershell
cd C:\Users\38349\Documents\coffee-shop-order
git fetch origin
git checkout main
git reset --hard checkpoint-stable-v2
git push origin main --force
```

⚠️ Force-push overwrites newer commits on GitHub / Vercel. Only use when you want live app back to this savepoint.

### Option B — Look at the savepoint without moving main

```powershell
cd C:\Users\38349\Documents\coffee-shop-order
git fetch origin
git checkout checkpoint-stable-v2
# when done inspecting:
git checkout main
```

### Option C — Soft undo (safer if others use the repo)

```powershell
git log --oneline -15
git revert <bad-commit-sha>
git push origin main
```

### Option D — Compare branding work to savepoint

```powershell
git diff checkpoint-stable-v2..main
```

### Older tag (only if needed)

```powershell
git reset --hard checkpoint-stable-v1
# then force-push only if you really want that older state live
```

---

## How to protect DATA (orders)

Code restore does **not** restore deleted orders.

### Before risky experiments

1. Supabase → **Database** → **Backups** (Pro) or export tables  
2. Or Table Editor → `orders` → export CSV  
3. Admin wipe is destructive — needs password + `FSHI TE GJITHA`

### After accidental wipe

Only recoverable if Supabase has a backup (plan-dependent) or you have a CSV export.

---

## Create a NEW checkpoint later

Whenever the app feels good again (e.g. after branding lands):

```powershell
cd C:\Users\38349\Documents\coffee-shop-order
git checkout main
git pull
# update this file (date + tag name), commit
git tag -a checkpoint-stable-v3 -m "Stable after branding"
git push origin checkpoint-stable-v3
git push origin main
```

---

## Quick “is it healthy?” checklist

- [ ] Login works for `shankisti1` / `kamerieri1` / `pronari_phm`  
- [ ] Phone order → appears on shankist  
- [ ] Gati → appears on kamerier  
- [ ] Client sticker order → exact name + orange card  
- [ ] **Ngjitëset QR** only after admin login  
- [ ] Vercel deploy green on `main`  

---

*Keep this file in the repo. Tag + this doc = your save point.*
