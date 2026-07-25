# Café Sol — Coffee Shop Ordering System

Self-service table ordering: customers scan a QR code, browse the menu on their phone, and place an order. Staff see new orders instantly on a dashboard behind the bar.

**Live:** https://coffee-shop-order-olive.vercel.app/

## Stack

- **Frontend:** React + Vite + TypeScript + React Router
- **Backend:** Supabase (Postgres + Realtime)
- **Hosting:** Any static host (Vercel, Netlify, etc.)

## Routes

| Route | Who | Purpose |
|-------|-----|---------|
| `/order?table={n}` | Customer | Browse menu, place order |
| `/dashboard` | Staff | View & manage orders (PIN: `1234`) |

## Quick start

```bash
cd coffee-shop-order
npm install
cp .env.example .env
# Edit .env with your Supabase URL and anon key
npm run dev
```

Open:

- Customer: http://localhost:5173/order?table=3
- Dashboard: http://localhost:5173/dashboard (PIN `1234`)

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the full script in `supabase/schema.sql`.
3. Confirm **Realtime** is enabled for `orders`:
   - Database → Publications → `supabase_realtime` → include `orders`
   - (The SQL script also runs `ALTER PUBLICATION supabase_realtime ADD TABLE orders`.)
4. Project **Settings → API**: copy Project URL and `anon` public key into `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### What the schema creates

- Table `orders` (`id`, `table_number`, `items` jsonb, `total`, `status`, `created_at`)
- RLS policies: anonymous insert / select / update (fine for v1; tighten later)
- Realtime publication on `orders`

## QR codes

Generate one QR per table pointing at:

```
https://yourdomain.com/order?table=1
https://yourdomain.com/order?table=2
...
```

Print and place on each table. Customers never type a table number.

## Deploy

Build static assets:

```bash
npm run build
```

Deploy the `dist/` folder to Vercel, Netlify, or similar. Set the same `VITE_SUPABASE_*` env vars in the host dashboard before building.

For SPA routing on static hosts, redirect all paths to `index.html` (Vite’s defaults work on Vercel; for Netlify add a `_redirects` file if needed).

## Features (v1)

- [x] Customer menu at `/order?table={number}`
- [x] Floating cart bar + order review + confirmation
- [x] Staff dashboard with PIN protection
- [x] Supabase insert + Realtime subscription
- [x] Mark orders done
- [x] Notification sound on new orders (toggle)
- [x] Daily order count + revenue total
- [x] Mobile-first warm menu aesthetic

## Not in v1 (planned later)

WiFi lock, menu admin, order notes, multi-language, daily reports download, worker push notifications.
