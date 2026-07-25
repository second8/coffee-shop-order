import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/orders'
import { SHOP_NAME } from '../data/menu'

export default function HomePage() {
  return (
    <div className="home-page">
      <div className="home-card">
        <div className="home-mark" aria-hidden>
          ◎
        </div>
        <h1>{SHOP_NAME}</h1>
        <p className="home-sub">Table ordering — try it locally</p>

        <div className="home-links">
          <Link className="btn btn-primary btn-block" to="/order?table=3">
            Open customer menu (Table 3)
          </Link>
          <Link className="btn btn-secondary btn-block" to="/dashboard">
            Open staff dashboard
          </Link>
        </div>

        <p className="home-hint">
          Dashboard PIN: <strong>1234</strong>
        </p>

        <div className={`home-mode ${isSupabaseConfigured ? 'is-live' : 'is-demo'}`}>
          {isSupabaseConfigured ? (
            <>
              <strong>Live mode</strong> — orders go to Supabase
            </>
          ) : (
            <>
              <strong>Demo mode</strong> — orders saved in this browser
              (no Supabase setup needed). Open menu + dashboard in two tabs to
              see the full flow.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
