import { Link } from 'react-router-dom'
import { MENU_TITLE, SHOP_NAME, INSTAGRAM } from '../data/menu'
import { sq } from '../i18n/sq'

/**
 * Public landing — customers use QR codes, not this page.
 * Staff/QR tools are not advertised to walk-in guests.
 */
export default function HomePage() {
  return (
    <div className="home-page">
      <div className="home-card">
        <p className="home-kicker">{MENU_TITLE}</p>
        <h1>{SHOP_NAME}</h1>
        <p className="home-sub">{sq.homeTitle}</p>
        <p className="home-scan-hint">{sq.homeScanQr}</p>
        {INSTAGRAM && (
          <p className="home-ig">{INSTAGRAM}</p>
        )}
        {/* Staff entry is intentional but de-emphasized (not a demo CTA) */}
        <Link className="home-staff-link" to="/dashboard">
          {sq.homeStaff}
        </Link>
      </div>
    </div>
  )
}
