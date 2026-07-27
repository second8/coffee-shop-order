import { Link } from 'react-router-dom'
import { MENU_TITLE, SHOP_NAME, INSTAGRAM } from '../data/menu'
import { sq } from '../i18n/sq'

/**
 * Public landing — brand layout from Figma Modern-Retro:
 * top nav + checkered strip + gold hero + black footer wordmark.
 * Customers use QR codes; staff link stays de-emphasized.
 */
export default function HomePage() {
  return (
    <div className="phm-home">
      <header className="phm-topnav">
        <span className="phm-wordmark">PHM</span>
        <div className="phm-topnav-links">
          <span className="phm-nav-link">{MENU_TITLE}</span>
          {INSTAGRAM && (
            <a
              className="phm-nav-link"
              href={`https://instagram.com/${INSTAGRAM.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              {INSTAGRAM}
            </a>
          )}
        </div>
      </header>
      <div className="phm-checkered" aria-hidden />

      <section className="phm-home-hero">
        <p className="phm-caption">Prishtinë</p>
        <h1 className="phm-display-title">{SHOP_NAME}</h1>
        <p className="phm-hero-lead">{sq.homeTitle}</p>
        <p className="phm-hero-body">{sq.homeScanQr}</p>
        <div className="phm-pill-btn phm-pill-btn--ink phm-pill-btn--static">
          Skanoni QR
        </div>
      </section>

      <section className="phm-home-band">
        <p className="phm-band-line">Coffee</p>
        <p className="phm-band-line">Desserts</p>
        <p className="phm-band-line">Lemonades</p>
        <p className="phm-band-line phm-band-line--accent">Order</p>
      </section>

      <footer className="phm-home-foot">
        <p className="phm-foot-wordmark">{SHOP_NAME}</p>
        <Link className="phm-staff-entry" to="/dashboard">
          {sq.homeStaff}
        </Link>
        <div className="phm-checkered phm-checkered--tall" aria-hidden />
      </footer>
    </div>
  )
}
