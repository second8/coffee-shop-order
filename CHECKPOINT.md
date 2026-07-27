# Restore point — coffee-shop-order

**Primary savepoint (use this first if a later redesign goes wrong):**

| | |
|--|--|
| **Name** | Editorial clean brand |
| **Date** | 2026-07-27 |
| **Git tag** | `checkpoint-stable-v3` |
| **Alias tag** | `checkpoint-editorial-clean` (same commit) |
| **Commit** | `7c7914d` — *Retheme customer UI to new editorial Figma brand* (+ this doc) |
| **PC** | `C:\Users\38349\Documents\coffee-shop-order` |
| **Live** | https://coffee-shop-order-olive.vercel.app/ |
| **GitHub** | https://github.com/second8/coffee-shop-order |
| **Branch** | `main` |
| **Supabase** | `xdqigvsgmutjimzddwqi` |

### Older savepoints

| Tag | When | What |
|-----|------|------|
| `checkpoint-stable-v2` / `checkpoint-pre-branding` | 2026-07-27 | Pre-Figma branding (warm cream / orange era) |
| `checkpoint-stable-v1` | 2026-07-26 | Pre-Swiss restore checkpoint |

Prefer **v3 / editorial-clean** for “the clean look I liked.”

---

## What’s frozen in checkpoint-stable-v3

Full product + **editorial Figma brand** on customer UI:

### Product / ops (unchanged core)
- Customer QR order (Albanian chrome, notes, review, confirm)
- Staff: shankisti / kamerieri / admin (`pronari_phm`)
- Kitchen board + table bills + pay (per person + equal + paid history)
- Manual orders, cancel with reason, stickers admin-only
- Supabase + Vercel deploy on `main`
- Stickers list still **localStorage** (`phm-stickers-v1`) until DB sync

### Customer UI / brand (v3)
- **Fonts:** Gowun Batang (display) + Rethink Sans (body)
- **Palette:** paper `#FCFAF6`, beige `#F6F0E4`, accent brown `#3D1A0D`, muted `#5B5B5B`, line `#E4E4E4`
- **Layout UX:** sticky nav, announcement chip, soft hero, category rail + scroll-spy, list menu rows, qty / + Shto, full-width sticky CTA, redesigned review + confirm
- Soft 10px cards; no racing-stripe / Staatliches / Jaro era

**Not in git:** `.env` secrets — restore from password manager / Vercel if missing.

---

## Staff logins (current)

| Role | Username | Password |
|------|----------|----------|
| Pronari | `pronari_phm` | *your owner password* |
| Shankist 1 | `shankisti1` | `mulliri7x` |
| Shankist 2 | `shankisti2` | `espressoQ9` |
| Kamerier 1 | `kamerieri1` | `tavolina3k` |
| Kamerier 2 | `kamerieri2` | `faturaZ8` |

Only these 5 accounts. Details: `WORKERS.md`.

---

## How to restore CODE to this clean brand

Paths for **this PC**. On another machine, change the `cd` folder.

### Option A — Put v3 back on `main` + redeploy (recommended)

```powershell
cd C:\Users\38349\Documents\coffee-shop-order
git fetch origin
git checkout main
git reset --hard checkpoint-stable-v3
git push origin main --force
```

Same with the alias:

```powershell
git reset --hard checkpoint-editorial-clean
git push origin main --force
```

⚠️ Force-push overwrites newer commits on GitHub / Vercel. Only when you want live app back to this look.

### Option B — Inspect without moving main

```powershell
git fetch origin
git checkout checkpoint-stable-v3
# when done:
git checkout main
```

### Option C — Compare a redesign to this savepoint

```powershell
git diff checkpoint-stable-v3..main
```

### Older tags

```powershell
git reset --hard checkpoint-stable-v2   # pre-editorial branding
# git reset --hard checkpoint-stable-v1 # older still
```

---

## How to protect DATA (orders)

Code restore does **not** restore deleted orders. Export CSV / Supabase backup before big wipes.

---

## Create a NEW checkpoint later

After a full redesign you love:

```powershell
cd C:\Users\38349\Documents\coffee-shop-order
git checkout main
git pull
# update this file (date + tag name), commit
git tag -a checkpoint-stable-v4 -m "Stable after full redesign"
git push origin checkpoint-stable-v4
git push origin main
```

---

## Quick health check

- [ ] Login works for shankist / kamerier / pronari  
- [ ] Phone order → shankist → Gati → kamerier  
- [ ] Customer UI is cream editorial (not old orange/racing)  
- [ ] Category rail + sticky cart CTA work  
- [ ] Vercel deploy green on `main`  

---

*Tag + this doc = your named save point. Resume redesign from here anytime.*
