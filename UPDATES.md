# How updates work (easy path)

You do **not** need to give me permanent access to Vercel or Supabase.

## Default workflow (recommended)

1. You tell me what to change (menu items, PIN, design, features).
2. I edit the code in `C:\Users\Rimma\coffee-shop-order`.
3. I (or you) run:

```powershell
cd C:\Users\Rimma\coffee-shop-order
git add .
git commit -m "Describe the change"
git push
```

4. **Vercel auto-deploys** from GitHub `main` in about a minute.
5. Hard-refresh the live site if you still see the old version.

That’s it — no re-upload, no re-wiring Supabase each time.

## Local test before going live

```powershell
cd C:\Users\Rimma\coffee-shop-order
npm run dev
```

Open http://localhost:5173 (or the port Vite prints).

## Environment variables

| Where | What |
|--------|------|
| Local | `.env` (never commit this file) |
| Vercel | Project → Settings → Environment Variables |

Keys you should have:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- optional: `VITE_DASHBOARD_PIN` (defaults to `197951` in code)

After changing Vercel env vars → **Redeploy**.

## Where your sales data lives

- **Supabase** → Table Editor → `orders`  
  Every order is stored forever (id, table, items, total, status, time).
- **Dashboard → Sales & history** → filter by period + **Download CSV** for Excel / bookkeeping.

## Changing the staff PIN

1. Edit `DASHBOARD_PIN` default in `src/pages/DashboardPage.tsx`, **or**
2. Set `VITE_DASHBOARD_PIN=yourpin` in `.env` and Vercel, then redeploy.

Also bump `PIN_STORAGE_KEY` (e.g. `v3`) so old sessions re-login.

## Security notes (honest)

See `SECURITY.md`.
