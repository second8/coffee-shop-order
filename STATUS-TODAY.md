# Session status — 2026-07-26

**Project:** `C:\Users\Rimma\coffee-shop-order`  
**Live:** https://coffee-shop-order-olive.vercel.app/

---

## Built this session

- **Sound** on new order (louder 3-tone + vibrate; bell toggle tests sound)
- **Wait time + priority**: pending sorted oldest first; 5 / 10 / 15 min visual priority
- **Customer notes** on place order + dashboard cards (+ manual order)
- **Manual order** on live board (table + menu + note)
- **Sales**: more summary stats; tables limited to 5 + “Shfaq më shumë”
- **Shpejtësia**: all workers first → click profile → their stats + order details
- **Ekipi**: real names from `staff_profiles`, online chips, sessions list
- **Sessions resume** after page refresh (was only started on login before)

## Required: run migration once

In **Supabase → SQL Editor**, run entire file:

`supabase/MIGRATION_V2.sql`

Adds: cancel status, `archived_at`, `completed_*`, **`note`**, `staff_sessions`, profile read policy.

Then **everyone must log out and log in again** so work sessions record.

### Optional: fix worker display names

If names still look generic, in Supabase Table Editor → `staff_profiles` set `display_name`:

| email | display_name |
|-------|----------------|
| worker1@… | Punëtor 1 |
| worker2@… | Punëtor 2 |
| … | … |

## Deploy

```powershell
cd C:\Users\Rimma\coffee-shop-order
git add .
git commit -m "Dashboard: sound, priority wait, notes, manual order, team/speed UX"
git push
```

Vercel auto-deploys from `main`.
