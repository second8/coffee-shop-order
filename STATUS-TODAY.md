# Session handoff — 2026-07-26

**Continue from here tomorrow.**

| | |
|--|--|
| **Folder** | `C:\Users\Rimma\coffee-shop-order` |
| **Live** | https://coffee-shop-order-olive.vercel.app/ |
| **GitHub** | https://github.com/second8/coffee-shop-order |
| **Branch** | `main` |
| **HEAD (end of day)** | `982b114` — pre-Swiss design restored + redeploy |
| **Save point tag** | `checkpoint-stable-v1` |
| **Supabase** | `xdqigvsgmutjimzddwqi` |

---

## Where we left off

### Product is live and usable for the shop
Two-monitor ops: **shankist** (kitchen) + **kamerier** (bills/pay) + **pronari** (full admin).

**Design:** Original warm café UI (Instrument Serif + Inter, cream, rounded cards).  
A full Swiss redesign was tried late day → **reverted**. Do **not** re-apply Swiss without a new explicit request.

### Save / restore
- Doc: **`CHECKPOINT.md`**
- Tag: **`checkpoint-stable-v1`**
- If design/code messes up:

```powershell
cd C:\Users\Rimma\coffee-shop-order
git fetch origin
git reset --hard checkpoint-stable-v1
git push origin main --force
```

---

## What we built / fixed today (summary)

### Roles & logins
| Role | Username | Password | Screen |
|------|----------|----------|--------|
| Pronari | `pronari_phm` | *your owner password* | Everything |
| Shankist 1 | `shankisti1` | `mulliri7x` | Kitchen |
| Shankist 2 | `shankisti2` | `espressoQ9` | Kitchen |
| Kamerier 1 | `kamerieri1` | `tavolina3k` | Bills / pay |
| Kamerier 2 | `kamerieri2` | `faturaZ8` | Bills / pay |

- Login is **username only** (no long email). Placeholder is just “Përdoruesi”.
- Legacy `worker1`–`worker4` accounts **deleted** from Supabase (only 5 accounts left).
- Details also in **`WORKERS.md`**.

### Flow (important)
1. Customer QR or **manual order** → new **kitchen ticket** (shankist).
2. Shankist presses **Gati**.
3. Table appears on **kamerier** (only after at least one Gati).
4. More orders same table = more **rounds** (newest on top). Ready = full opacity; still cooking = dimmed.
5. Kamerier pays **ready** amount only; pending stays for later.
6. **Paguaj** (person / equal / full ready) → when visit settled, next orders start fresh.

### Kamerier pay UX
- Per person (+/− items), stays on screen for next person.
- Equal split by N people.
- **Already paid** list visible after partial pay (e.g. 1 of 10 espressos shows as paid).
- Totals: already paid / remaining / this payment.

### Cancel
- Staff must give a **reason** (chips: left / wrong / double / other + free text).
- Stored as `cancel_reason`.

### Customer phone
- Optional **note** on review.
- Submit is **in the scroll** (not fixed under keyboard) so notes don’t block send.
- Double-submit lock + better errors.

### Admin panel stages
1. **Porosi të reja** — in kitchen  
2. **Gati për shërbim** — ready tickets  
3. **Presin pagesë** — open table bills  
4. **Të kompletuara (paguar)** — paid history  
5. **Të anuluara** — with reason  

Also: sales, speed, team, archive, **Cilësimet** wipe (password + phrase `FSHI TE GJITHA`).

### Infra / quality (from audit)
- Error boundary (no full white crash UI if React throws).
- `shared/menu.json` single menu for app + API.
- Never invent fake order IDs after create.
- Realtime reconnect banner + reload.
- Admin-only hard delete of orders (SQL applied).
- RLS recursion fix applied earlier (`FIX_RLS_RECURSION.sql`).
- Idle logout ~1 hour.
- Soft cool/warm tints for shankist/kamerier (light UI only).
- Home page: public scan message; staff link de-emphasized (no “table 3” demo CTA).

### Design experiment (reverted)
- Swiss / Inter-only redesign was **rolled back** to checkpoint.
- Live should match **warm Instrument Serif + cream** look after hard refresh.

---

## Supabase SQL that should already be applied

If something is missing, re-run in SQL Editor (safe-ish):

1. `supabase/schema.sql`
2. `supabase/MIGRATION_V2.sql` + `supabase/FIX_RLS_RECURSION.sql`
3. `supabase/MIGRATION_V3_ROLES_PAY.sql` — roles, `paid_at`, `note`, `cancel_reason`, `payment_events`
4. `supabase/FIX_ADMIN_DELETE.sql` — admin-only delete

Local secrets (do **not** commit): `.env` with  
`VITE_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, optional `SUPABASE_DB_PASSWORD`.

**Security note:** service role was used in chat earlier — still worth **rotating** in Supabase + Vercel when convenient.

---

## How to run / deploy tomorrow

```powershell
cd C:\Users\Rimma\coffee-shop-order
npm run dev          # local
# after code changes:
git add .
git commit -m "describe change"
git push origin main # Vercel auto-deploys
```

Local: http://localhost:5173  
Customer: `/order?table=3`  
Staff: `/dashboard`  
QR print: `/qr`

---

## Good next tasks (pick when ready)

- [ ] Rotate Supabase service_role key + update Vercel env  
- [ ] Print / stick QR codes for 30 tables; shop demo with partners  
- [ ] Menu admin UI (edit items without code) — menu lives in `shared/menu.json`  
- [ ] WiFi / network lock for ordering  
- [ ] Custom domain  
- [ ] Push notifications for kitchen  
- [ ] Optional: new design pass (lighter than Swiss; keep checkpoint first)  
- [ ] New git tag `checkpoint-stable-v2` after next stable day  

---

## Known / watch

| Issue | Notes |
|-------|--------|
| Browser cache after deploy | Hard refresh Ctrl+Shift+R or incognito |
| Design-refs folder | Local only `design-refs/` (Pinterest downloads) — not required; can delete |
| DB data | Git restore ≠ order restore; export CSV before big wipes |
| Admin wipe | Destructive; needs password + `FSHI TE GJITHA` |

---

## Key files

| Path | Purpose |
|------|---------|
| `CHECKPOINT.md` | Restore point instructions |
| `WORKERS.md` | Logins |
| `STATUS-TODAY.md` | This handoff |
| `shared/menu.json` | Menu + prices (app + API) |
| `src/pages/DashboardPage.tsx` | Staff boards |
| `src/pages/OrderPage.tsx` | Customer menu |
| `src/components/TablePayModal.tsx` | Pay / split |
| `src/lib/orders.ts` | Orders, bills, pay, wipe |
| `src/lib/auth.ts` | Login usernames → email |
| `supabase/*.sql` | Schema / migrations |

---

*End of day 2026-07-26. Resume with this file + cheatsheet/logins above.*
