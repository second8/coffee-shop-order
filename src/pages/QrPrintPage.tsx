import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { TABLE_COUNT, orderUrlForTable } from '../data/config'
import { SHOP_NAME } from '../data/menu'

type QrItem = { table: number; url: string; dataUrl: string }

export default function QrPrintPage() {
  const [count, setCount] = useState(TABLE_COUNT)
  const [items, setItems] = useState<QrItem[]>([])
  const [loading, setLoading] = useState(true)
  const base = useMemo(
    () =>
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://coffee-shop-order-olive.vercel.app',
    []
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const next: QrItem[] = []
      const n = Math.min(Math.max(1, count), 100)
      for (let table = 1; table <= n; table++) {
        const url = orderUrlForTable(table, base)
        const dataUrl = await QRCode.toDataURL(url, {
          width: 280,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#2a211c', light: '#ffffff' },
        })
        next.push({ table, url, dataUrl })
      }
      if (!cancelled) {
        setItems(next)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [count, base])

  return (
    <div className="qr-print-page">
      <header className="qr-toolbar no-print">
        <div>
          <h1>Kodet QR — tavolinat</h1>
          <p>
            {SHOP_NAME} · printoni dhe vendosini në tavolina. Nuk duhet database
            për tavolina — mjafton numri në link.
          </p>
        </div>
        <div className="qr-toolbar-actions">
          <label className="qr-count-label">
            Numri i tavolinave
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 1)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
          >
            Printo / Ruaj PDF
          </button>
          <Link to="/dashboard" className="btn btn-secondary">
            Paneli
          </Link>
        </div>
      </header>

      {loading ? (
        <p className="qr-loading">Duke gjeneruar kodet…</p>
      ) : (
        <div className="qr-grid">
          {items.map((item) => (
            <article key={item.table} className="qr-card">
              <p className="qr-shop">{SHOP_NAME}</p>
              <h2 className="qr-table">Tavolina {item.table}</h2>
              <img src={item.dataUrl} alt={`QR tavolina ${item.table}`} />
              <p className="qr-hint">Skanoni për të porositur</p>
              <p className="qr-url">{item.url}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
