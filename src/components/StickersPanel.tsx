import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import {
  CLIENT_MIN_ORDER_EUR,
  loadStickersConfig,
  orderUrlForClient,
  orderUrlForTable,
  sanitizeClientName,
  saveStickersConfig,
  type ClientSticker,
  type StickersConfig,
} from '../data/stickers'
import { SHOP_NAME } from '../data/menu'

type TableQr = { kind: 'table'; table: number; dataUrl: string }
type ClientQr = {
  kind: 'client'
  id: string
  name: string
  dataUrl: string
}
type QrItem = TableQr | ClientQr

/**
 * Admin-only stickers manager (tables + named client/office QR).
 * Rendered inside the dashboard — never public.
 */
export default function StickersPanel() {
  const [cfg, setCfg] = useState<StickersConfig>(() =>
    typeof window !== 'undefined'
      ? loadStickersConfig()
      : { tableCount: 30, clients: [] }
  )
  const [newClientName, setNewClientName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [items, setItems] = useState<QrItem[]>([])
  const [loading, setLoading] = useState(true)

  const base = useMemo(
    () =>
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://coffee-shop-order-olive.vercel.app',
    []
  )

  const persist = useCallback((next: StickersConfig) => {
    saveStickersConfig(next)
    setCfg(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const next: QrItem[] = []
      const n = Math.min(Math.max(1, cfg.tableCount), 100)
      for (let table = 1; table <= n; table++) {
        const url = orderUrlForTable(table, base)
        const dataUrl = await QRCode.toDataURL(url, {
          width: 280,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f0f0f', light: '#ffffff' },
        })
        next.push({ kind: 'table', table, dataUrl })
      }
      for (const client of cfg.clients) {
        // Encode name in URL — this is what the order page reads back
        const url = orderUrlForClient(client.name, base)
        const dataUrl = await QRCode.toDataURL(url, {
          width: 280,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f0f0f', light: '#ffffff' },
        })
        next.push({
          kind: 'client',
          id: client.id,
          name: client.name,
          dataUrl,
        })
      }
      if (!cancelled) {
        setItems(next)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cfg.tableCount, cfg.clients, base])

  const handleAddClient = (e: FormEvent) => {
    e.preventDefault()
    setAddError(null)
    const name = sanitizeClientName(newClientName)
    if (!name) {
      setAddError('Emër i pavlefshëm (2–48 shkronja).')
      return
    }
    const exists = cfg.clients.some(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    )
    if (exists) {
      setAddError('Ky klient ekziston tashmë.')
      return
    }
    const sticker: ClientSticker = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    }
    persist({ ...cfg, clients: [...cfg.clients, sticker] })
    setNewClientName('')
  }

  const removeClient = (id: string) => {
    persist({
      ...cfg,
      clients: cfg.clients.filter((c) => c.id !== id),
    })
  }

  const tables = items.filter((i): i is TableQr => i.kind === 'table')
  const clients = items.filter((i): i is ClientQr => i.kind === 'client')

  return (
    <div className="qr-print-page stickers-embedded">
      <header className="qr-toolbar no-print">
        <div>
          <h1>Ngjitëset QR</h1>
          <p>
            {SHOP_NAME} · vetëm admin. Emri i klientit në ngjitëse del i njëjtë
            në porosi. Min. €{CLIENT_MIN_ORDER_EUR.toFixed(0)} për klientë.
          </p>
        </div>
        <div className="qr-toolbar-actions">
          <label className="qr-count-label">
            Numri i tavolinave
            <input
              type="number"
              min={1}
              max={100}
              value={cfg.tableCount}
              onChange={(e) =>
                persist({
                  ...cfg,
                  tableCount: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
          >
            Printo / Ruaj PDF
          </button>
        </div>
      </header>

      <section className="qr-admin-panel no-print">
        <h2>Klientë / zyra</h2>
        <p className="qr-admin-hint">
          Shkruani emrin e klientit (p.sh. <strong>Acme Office</strong>).
          Kur porositin, në shank dhe kamerier del saktësisht ky emër + badge
          ZYRË (jo “Tavolina”).
        </p>
        <form className="qr-add-client" onSubmit={handleAddClient}>
          <input
            type="text"
            maxLength={48}
            placeholder="Emri i klientit / zyrës"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Shto ngjitëse
          </button>
        </form>
        {addError && <p className="form-error">{addError}</p>}
        {cfg.clients.length > 0 && (
          <ul className="qr-client-list">
            {cfg.clients.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                <button
                  type="button"
                  className="btn-ghost-inline"
                  onClick={() => removeClient(c.id)}
                >
                  Hiq
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loading ? (
        <p className="qr-loading">Duke gjeneruar kodet…</p>
      ) : (
        <>
          {tables.length > 0 && (
            <section className="qr-section">
              <h2 className="qr-section-title no-print">Tavolinat</h2>
              <div className="qr-grid">
                {tables.map((item) => (
                  <article key={item.table} className="qr-card">
                    <p className="qr-shop">{SHOP_NAME}</p>
                    <h2 className="qr-table">Tavolina {item.table}</h2>
                    <img
                      src={item.dataUrl}
                      alt={`QR tavolina ${item.table}`}
                    />
                    <p className="qr-hint">Skanoni për të porositur</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {clients.length > 0 && (
            <section className="qr-section">
              <h2 className="qr-section-title no-print">
                Klientë / zyra ({clients.length})
              </h2>
              <div className="qr-grid">
                {clients.map((item) => (
                  <article key={item.id} className="qr-card qr-card-client">
                    <p className="qr-shop">{SHOP_NAME}</p>
                    <p className="qr-client-badge">ZYRË · KLIENT</p>
                    <h2 className="qr-table qr-client-name">{item.name}</h2>
                    <img
                      src={item.dataUrl}
                      alt={`QR klient ${item.name}`}
                    />
                    <p className="qr-hint">
                      Porosi për zyrë · min. €{CLIENT_MIN_ORDER_EUR}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
