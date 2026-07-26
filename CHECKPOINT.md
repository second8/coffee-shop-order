# Restore point — coffee-shop-order

**Date:** 2026-07-26  
**Git tag:** `checkpoint-stable-v1`  
**Commit:** `c277839` (includes this CHECKPOINT.md + all stable app features)  
**Live:** https://coffee-shop-order-olive.vercel.app/  
**GitHub:** https://github.com/second8/coffee-shop-order  

If something breaks after new changes, use this file + the git tag to go back.

---

## What’s included in this checkpoint (code)

- Customer QR order (Albanian UI, notes, scrollable submit)
- Staff: shankisti / kamerieri / admin (`pronari_phm`)
- Kitchen board + table bills + pay (per person + equal + paid history)
- Manual orders, cancel with reason chips, sound, priority wait
- Admin stages: new → ready → pay → completed / cancelled
- Admin wipe (password + phrase), sales/speed/team/archive
- Error boundary, shared menu (`shared/menu.json`), admin-only delete RLS
- Soft cool/warm staff tints (light UI)

---

## Staff logins (current)

| Role | Username | Password |
|------|----------|----------|
| Pronari | `pronari_phm` | *your owner password* |
| Shankist 1 | `shankisti1` | `mulliri7x` |
| Shankist 2 | `shankisti2` | `espressoQ9` |
| Kamerier 1 | `kamerieri1` | `tavolina3k` |
| Kamerier 2 | `kamerieri2` | `faturaZ8` |

Only these 5 accounts (legacy workers removed).

---

## Supabase migrations that should be applied

Run in SQL Editor if a fresh project / missing features (safe-ish re-run):

1. `supabase/schema.sql` (base)
2. `supabase/MIGRATION_V2.sql` + `FIX_RLS_RECURSION.sql`
3. `supabase/MIGRATION_V3_ROLES_PAY.sql` (roles, paid_at, note, cancel_reason, payment_events)
4. `supabase/FIX_ADMIN_DELETE.sql` (admin-only hard delete)

Project ref: `xdqigvsgmutjimzddwqi`

---

## How to restore CODE (if a bad deploy)

### Option A — Go back to this tag (recommended)

```powershell
cd C:\Users\Rimma\coffee-shop-order
git fetch origin
git checkout checkpoint-stable-v1
```

To put that version back on `main` and redeploy Vercel:

```powershell
git checkout main
git reset --hard checkpoint-stable-v1
git push origin main --force
```

⚠️ Force-push only if you understand it overwrites newer commits on GitHub.

### Option B — Soft undo last commit(s) locally

```powershell
git log --oneline -10
git checkout main
git revert <bad-commit-sha>   # safer than reset if others use the repo
git push origin main
```

### Option C — Compare what changed

```powershell
git diff checkpoint-stable-v1..main
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

Whenever the app feels good again:

```powershell
cd C:\Users\Rimma\coffee-shop-order
git checkout main
git pull
# update the tag name + date in this file, commit CHECKPOINT.md
git tag -a checkpoint-stable-v2 -m "Stable after XYZ"
git push origin checkpoint-stable-v2
git push origin main
```

---

## Quick “is it healthy?” checklist

- [ ] Login works for `shankisti1` / `kamerieri1` / `pronari_phm`  
- [ ] Phone order → appears on shankist  
- [ ] Gati → appears on kamerier  
- [ ] Pay per person shows already-paid lines  
- [ ] Vercel deploy green on `main`  

---

*Keep this file in the repo. Tag + this doc = your save point.*
