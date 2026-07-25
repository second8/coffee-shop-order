# Security — what’s protected, what isn’t

This is a self-service table ordering app. Perfect bank-level security is not the goal; **stopping easy abuse** is.

## Already in place

| Control | Detail |
|---------|--------|
| No customer accounts | Less data to steal |
| Anon key only in browser | Never put `service_role` / secret keys in the frontend |
| `.env` gitignored | Secrets not in GitHub |
| Menu price validation | Server-bound totals are recalculated from the hardcoded menu — clients cannot invent free items or fake prices in the app |
| Table / quantity limits | Tables 1–100, qty per item ≤ 20, limited lines per order |
| Dashboard PIN | Blocks casual visitors from the staff UI (PIN: set in code / `VITE_DASHBOARD_PIN`) |
| RLS on `orders` | Table access goes through Supabase policies |
| HTTPS on Vercel | Transport encryption in production |

## Known limits (be aware)

1. **Dashboard PIN is not bank security**  
   It is checked in the browser. A determined person who inspects the site code can find it. It stops staff devices / random guests, not a skilled attacker.

2. **Anyone who has the public site can insert orders**  
   The QR URL is public by design. Someone can open `/order?table=3` from home and place a fake order.  
   **Mitigation later:** WiFi lock (only shop network), or require a short table code.

3. **Anon can currently read/update all orders** (v1 RLS)  
   Needed so the simple dashboard works without staff login. A technical user with the anon key could read sales history via the API.

4. **PIN was shared in chat**  
   Fine for a café PIN; change it anytime if it leaks more widely.

## Recommended next hardening (when you want)

### A. Staff login (best real fix for dashboard data)

1. Supabase → Authentication → enable Email  
2. Create one staff user  
3. Change RLS so:
   - `anon` can **INSERT** only  
   - only `authenticated` can **SELECT** / **UPDATE**  
4. Dashboard: login with email/password instead of (or in addition to) PIN  

I can implement this when you’re ready.

### B. WiFi lock

Only accept orders from your shop’s public IP (Edge Function or server check). Stops remote troll orders.

### C. Supabase backups

Dashboard → Project Settings → Database → enable **Point-in-time recovery** / regular backups (plan-dependent). Your `orders` table **is** the long-term sales archive.

### D. Never share

- Database password  
- `service_role` key  
- Supabase account password  

The `anon` key is designed to be public with good RLS.

## If something looks wrong

- Unexpected orders → check table numbers / times in Supabase Table Editor  
- Lock dashboard when leaving the tablet (Lock button)  
- Rotate PIN by changing code or `VITE_DASHBOARD_PIN` and redeploying  
