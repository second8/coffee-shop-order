# Session status — 2026-07-25

**Continue from here tomorrow.**  
Project folder: `C:\Users\Rimma\coffee-shop-order`  
Live site: https://coffee-shop-order-olive.vercel.app/

Quick day-to-day logins: see **`SHOP-CHEATSHEET.md`**.

---

## Where we left off

### Working
- Customer menu (Albanian UI, English menu names/prices)
- Place order → Supabase → staff dashboard (realtime)
- Admin login + 4 workers
- Admin **dark** theme / worker **light** theme
- Done = soft green, cancelled = soft red
- QR print page for 30 tables: `/qr`
- Sales, speed, team, archive tabs (admin)
- Completion tracking (`completed_at`, `completed_by`) when migration applied
- Vercel auto-deploy from GitHub `main`

### Needs attention / verify tomorrow
1. **Supabase migrations** — user hit errors until SQL was run. Confirm these exist on the DB:
   - `orders.archived_at`, `completed_at`, `completed_by`
   - status allows `pending` | `done` | `cancelled` (constraint `orders_status_check`)
   - table `staff_sessions` (login→logout time)
   - SQL files: `supabase/MIGRATION_V2.sql`, `FIX_CANCEL.sql`, `ADD_ARCHIVED_AT.sql`
2. **Cancel / archive** — only fully work after that SQL
3. **Admin password** — not stored in cheatsheet; fill in yourself
4. **Service role key** was used in chat for admin/worker setup — consider **rotating** it in Supabase for security
5. **Print real QR stickers** for 30 tables and test on phones in the shop
6. **Demo tomorrow** — use cheatsheet flow: phone order + laptop dashboard

---

## What we built today (summary)

### Product
| Area | Details |
|------|---------|
| Stack | React + Vite + TypeScript, Supabase, Vercel |
| Routes | `/` home · `/order?table=N` · `/dashboard` · `/qr` |
| Shop | Pristina Homemade Muffins · The Summer Menu |
| Menu | English items/prices (from printed card) · UI Albanian |
| Fonts | Instrument Serif (titles) · Inter (body) |
| Tables | 30 via URL only — no DB table list |

### Customer
- Mobile menu, cart bar, review, place order
- Larger +/− controls
- No logo mark in header
- Insert without `.select()` so RLS doesn’t block anon

### Staff
- Email login (no PIN anymore)
- Workers: live board only
- Admin: sales, speed, team (workers + sessions), archive
- Mark done / cancel / archive / restore / hard delete
- Archive auto-purge idea: 7 days

### Workers created in Supabase
| Name | Email | Password |
|------|--------|----------|
| Punëtor 1 | worker1@pristinamuffins.local | dielli1 |
| Punëtor 2 | worker2@pristinamuffins.local | deti22 |
| Punëtor 3 | worker3@pristinamuffins.local | mali33 |
| Punëtor 4 | worker4@pristinamuffins.local | lule44 |

Admin email: **contact@secondeight.net** (password = yours)

### Infra
| | |
|--|--|
| GitHub | https://github.com/second8/coffee-shop-order |
| Vercel | coffee-shop-order-olive.vercel.app |
| Supabase | project ref `xdqigvsgmutjimzddwqi` |
| Env (local + Vercel) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

### Key files
| File | Purpose |
|------|---------|
| `SHOP-CHEATSHEET.md` | Short links + logins for the shop |
| `WORKERS.md` | Worker logins + QR notes |
| `AUDIT.md` | Feature audit notes |
| `STATUS-TODAY.md` | This file — handoff |
| `src/data/menu.ts` | Menu + shop name |
| `src/data/config.ts` | Table count (30), QR base URL |
| `src/pages/*` | Order, Dashboard, QR, Home |
| `src/lib/orders.ts` | Orders + stats + sessions |
| `src/lib/auth.ts` | Login + role from JWT |
| `supabase/*.sql` | Schema / migrations |
| `api/create-order.ts` | Optional server insert (Vercel) |

---

## How to continue tomorrow

```powershell
cd C:\Users\Rimma\coffee-shop-order
npm run dev
```

Or use live site only. After code changes:

```powershell
git add .
git commit -m "describe change"
git push
```

Vercel redeploys automatically.

### Good next tasks (pick one)
- [ ] Confirm SQL migrations applied; fix any remaining cancel/archive errors  
- [ ] Print QR for 30 tables; walk shop with partners  
- [ ] Change admin password doc / rotate service role key  
- [ ] WiFi lock (only shop network can order) — planned earlier, not built  
- [ ] Menu admin UI (edit items without code)  
- [ ] Order notes (no ice, extra sugar)  
- [ ] Albanian/English toggle on customer menu  
- [ ] Push notifications to workers’ phones  
- [ ] Custom domain (e.g. order.yourshop.com)  

---

## Known issues we already fixed today

| Problem | Fix |
|---------|-----|
| Env vars typed in PowerShell | Put in `.env` file |
| Git remote was `YOUR_USERNAME` | Set to `second8/coffee-shop-order` |
| Logged in as worker not admin | `app_metadata.role` + JWT; staff_profiles |
| RLS on order insert | Insert without select; anon insert policy |
| `archived_at does not exist` | Migration SQL + graceful select without column |
| Cancel check constraint | Allow `cancelled` in `orders_status_check` |
| Complex passwords | Simplified Albanian passwords |

---

## Do not commit

- `.env` (local secrets)  
- Service role key (never in frontend / `VITE_*`)  

---

*End of day. Resume with cheatsheet + this file.*
