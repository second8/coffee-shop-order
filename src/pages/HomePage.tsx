import { Link } from 'react-router-dom'
import { MENU_TITLE, SHOP_NAME, INSTAGRAM } from '../data/menu'
import { sq } from '../i18n/sq'

/**
 * Public landing — editorial brand from latest Figma Styles:
 * cream paper, Gowun Batang display, soft announcement chip, underline CTAs.
 * Customers use QR; staff stays quiet.
 */
export default function HomePage() {
  return (
    <div className="phm-home">
      <header className="phm-topnav">
        <span className="phm-nav-label">Menu</span>
        <div className="phm-topnav-links">
          {INSTAGRAM && (
            <a
              className="phm-text-link"
              href={`https://instagram.com/${INSTAGRAM.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              {INSTAGRAM}
            </a>
          )}
        </div>
      </header>

      <div className="phm-announce" role="note">
        <span>{MENU_TITLE}</span>
        <span className="phm-announce-sep">·</span>
        <span>{sq.homeScanQr}</span>
      </div>

      <section className="phm-home-hero">
        <p className="phm-eyebrow">Prishtinë</p>
        <h1 className="phm-display-title">{SHOP_NAME}</h1>
        <p className="phm-hero-lead">{sq.homeTitle}</p>
        <p className="phm-text-link phm-text-link--static">Skanoni QR në tavolinë</p>
      </section>

      <section className="phm-home-cards">
        <article className="phm-info-card">
          <p className="phm-label">Coffee</p>
          <p className="phm-card-title">Espresso, iced &amp; more</p>
          <p className="phm-card-body">Fillimisht skanoni kodin QR të tavolinës suaj.</p>
        </article>
        <article className="phm-info-card">
          <p className="phm-label">Desserts</p>
          <p className="phm-card-title">Torta &amp; brownies</p>
          <p className="phm-card-body">Porositni nga telefoni — stafi sjell në tavolinë.</p>
        </article>
        <article className="phm-info-card">
          <p className="phm-label">Lemonades</p>
          <p className="phm-card-title">Të freskëta</p>
          <p className="phm-card-body">Shtoni shënim opsional për preferenca.</p>
        </article>
      </section>

      <footer className="phm-home-foot">
        <p className="phm-foot-line">{SHOP_NAME}</p>
        <Link className="phm-text-link" to="/dashboard">
          {sq.homeStaff}
        </Link>
      </footer>
    </div>
  )
}
