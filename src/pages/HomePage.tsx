import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/orders'
import { MENU_TITLE, SHOP_NAME } from '../data/menu'
import { sq } from '../i18n/sq'

export default function HomePage() {
  return (
    <div className="home-page">
      <div className="home-card">
        <p className="home-kicker">{MENU_TITLE}</p>
        <h1>{SHOP_NAME}</h1>
        <p className="home-sub">{sq.homeTitle}</p>

        <div className="home-links">
          <Link className="btn btn-primary btn-block" to="/order?table=3">
            {sq.homeCustomer}
          </Link>
          <Link className="btn btn-secondary btn-block" to="/dashboard">
            {sq.homeStaff}
          </Link>
          <Link className="btn btn-secondary btn-block" to="/qr">
            Kodet QR (30 tavolina)
          </Link>
        </div>

        {!isSupabaseConfigured && (
          <div className="home-mode is-demo">
            <strong>Demo</strong> — {sq.homeDemo}
          </div>
        )}
      </div>
    </div>
  )
}
