# Session handoff — 2026-07-26 (evening)

**Continue from here next session (any PC).**

| | |
|--|--|
| **Live** | https://coffee-shop-order-olive.vercel.app/ |
| **GitHub** | https://github.com/second8/coffee-shop-order |
| **Branch** | `main` |
| **HEAD** | `6ed1e21` — create-order API hardened; stickers admin-only; client names fixed |
| **Save point tag** | `checkpoint-stable-v1` (older; current main is ahead) |
| **Supabase project** | `xdqigvsgmutjimzddwqi` |

---

## How to continue on a **different PC** tomorrow

You do **not** need this machine. Everything important is on GitHub + Vercel + Supabase.

### 1. Get the code

```powershell
git clone https://github.com/second8/coffee-shop-order.git
cd coffee-shop-order
npm install
```

Or if the folder already exists:

```powershell
cd path\to\coffee-shop-order
git pull origin main
npm install
```

### 2. Local `.env` (required for dev / scripts)

Create `.env` in the project root (never commit it). Copy from your password manager / Vercel / Supabase dashboard:

```env
VITE_SUPABASE_URL=https://xdqigvsgmutjimzddwqi.supabase.co
VITE_SUPABASE_ANON_KEY=...          # Supabase → Settings → API → anon public
SUPABASE_SERVICE_ROLE_KEY=...       # Supabase → Settings → API → service_role (secret)
SUPABASE_URL=https://xdqigvsgmutjimzddwqi.supabase.co
# optional for SQL scripts:
# DATABASE_URL=...
# SUPABASE_DB_PASSWORD=...
```

Same keys must already be set in **Vercel → Project → Settings → Environment Variables** for the live site.

### 3. Run locally

```powershell
npm run dev
```

- Customer: http://localhost:5173/order?table=3  
- Staff: http://localhost:5173/dashboard  
- Stickers: only after admin login → tab **Ngjitëset QR**

### 4. Deploy (same as always)

```powershell
git add .
git commit -m "describe change"
git push origin main
```

Vercel auto-deploys `main` → live URL above. No need to “upload” from the PC.

### 5. Open in Grok / any AI agent

- Point the agent at the cloned folder  
- Say: **“Continue from STATUS-TODAY.md”**  
- Agent should read this file + `CHECKPOINT.md` + `WORKERS.md`

---

## Staff logins

| Role | Username | Password | Screen |
|------|----------|----------|--------|
| Pronari (admin) | `pronari_phm` | *your owner password* | Full admin + stickers |
| Shankist 1 | `shankisti1` | `mulliri7x` | Kitchen |
| Shankist 2 | `shankisti2` | `espressoQ9` | Kitchen |
| Kamerier 1 | `kamerieri1` | `tavolina3k` | Bills / pay |
| Kamerier 2 | `kamerieri2` | `faturaZ8` | Bills / pay |

Login = **username only** (no email). Details also in `WORKERS.md`.

---

## What we did this session (summary)

### Design
- **Geist** body font, regular, letter-spacing **-3%**
- Text **#332D29**, background **#F3EFE3**, highlight **#FFA425**
- Category titles (Coffee, Desserts…) **Instrument Serif**, larger/bolder
- Menu listings **black**, slightly larger type
- Shop logo / title **Instrument Serif**
- Table number **hidden** on customer UI (still in QR URL for kitchen)

### Stickers / QR (important)
- **Not public.** `/qr` redirects to `/dashboard`
- Only **pronari** → dashboard tab **“Ngjitëset QR”**
- Add **table** count + **named client** stickers (“Shto ngjitëse”)
- Printed stickers **do not show the URL**
- Client stickers → `/order?client=NameYouTyped`
- Client orders: **min €5**, orange gradient, badge **ZYRË**, title = **exact sticker name**
- Gradient stays for pending / ready / paid / completed

### Bugfixes (client name was “ZYRË / Klient”)
Root cause: customer insert used `.select()` after insert; anon has INSERT but not SELECT under RLS → saves failed / fields dropped.

**Fixed:**
- Insert with explicit `id`, **no** `.select()` for customer path  
- Name stored in: `client_name` column + note `ZYRE: Name` + items meta line  
- DB column `client_name` applied  
- create-order API hardened; `vercel.json` excludes `/api/*` from SPA rewrite  

### Files that matter
| Path | Purpose |
|------|---------|
| `STATUS-TODAY.md` | This handoff |
| `CHECKPOINT.md` | Older restore / logins / migrations list |
| `WORKERS.md` | Staff logins |
| `src/components/StickersPanel.tsx` | Admin stickers UI |
| `src/data/stickers.ts` | Client name helpers, QR URLs, local list |
| `src/pages/OrderPage.tsx` | Customer menu + client dest |
| `src/pages/DashboardPage.tsx` | Staff boards + stickers tab |
| `src/lib/orders.ts` | createOrder, bills, client normalize |
| `api/create-order.ts` | Server insert (service role) |
| `supabase/MIGRATION_V4_CLIENT_ORDERS.sql` | `client_name` column |
| `shared/menu.json` | Menu + prices |

---

## ⚠️ Stickers list = browser storage (PC-specific)

Custom client stickers you add under **Ngjitëset QR** are saved in **that browser’s localStorage** (`phm-stickers-v1`), not yet in Supabase.

| What | Same on new PC? |
|------|------------------|
| Live app code | Yes (GitHub → Vercel) |
| Orders / staff / menu | Yes (Supabase) |
| Staff logins | Yes |
| **List of named client stickers you added** | **No** — re-add names on the new browser, or use the same browser profile |

**Printed QR codes still work** on any PC (name is inside the QR URL). Only the **admin list** for reprinting needs re-adding on a new machine until we sync stickers to the DB.

Optional next step: store stickers in Supabase so all devices share one list.

---

## Good next tasks

- [ ] Confirm a **new** client-sticker order shows the **exact name** on shank + kamerier  
- [ ] Sync stickers to Supabase (multi-PC admin list)  
- [ ] Rotate service_role if it was ever pasted in chat  
- [ ] Print table + client stickers for the shop  
- [ ] Menu admin UI (`shared/menu.json`)  
- [ ] Tag `checkpoint-stable-v2` when stable  

---

## Quick health check

- [ ] `/dashboard` login works for shankist / kamerier / pronari  
- [ ] Phone order table 3 → appears on shankist  
- [ ] Gati → appears on kamerier  
- [ ] **Ngjitëset QR** only visible after admin login (not public `/qr`)  
- [ ] Client sticker order → title = sticker name + orange card  
- [ ] Vercel deploy green on `main`  

---

## Agent / human one-liner for next chat

> Open `coffee-shop-order`, pull `main`, read `STATUS-TODAY.md`. Live is Vercel; stickers are admin tab only; client orders must show the sticker name; stickers list is localStorage until we put it in Supabase.

---

*End of session 2026-07-26 evening. Resume with this file + `git pull origin main`.*
