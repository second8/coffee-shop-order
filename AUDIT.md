# Product audit → what we built

## You asked for

| Request | Decision |
|---------|----------|
| Done orders newest first | Sorted by `completed_at` desc, list layout |
| Cancel order | **Anulo** on pending |
| Delete / archive | **Arkivo** → archive tab; restore or permanent delete; auto-purge after **7 days** |
| Who completed | Name shown under done/cancelled cards + speed table |
| Login → logout work time | `staff_sessions` + **Ekipi** tab |
| Remove Live Supabase banner | Removed on home when live |
| Bigger +/−, clearer order UX | Larger tap targets, clearer prices |
| Remove “njëshi” | Removed |
| Instrument Sans + Inter | Titles + body |
| Worker finish counts | **Ekipi** tab |
| Best tables / busiest | **Shitjet** → Tavolinat |
| Peak work | **Shitjet** → Orët e pikut |

## Extra we added (ops value)

- Cancelled section on live board (separate from done)
- Worker cancel count + avg completion time
- Revenue attributed per worker
- CSV export includes status, completed_by, archived_at
- Session “Aktiv tani” if not logged out cleanly

## One SQL step required

Run `supabase/MIGRATION_V2.sql` in Supabase SQL Editor for:
- `cancelled` status
- `archived_at`
- `staff_sessions`
- delete policy + profile name reads
