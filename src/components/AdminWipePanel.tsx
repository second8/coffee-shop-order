import { useState, type FormEvent } from 'react'
import { verifyAdminPassword } from '../lib/auth'
import { wipeAllOrders } from '../lib/orders'
import { sq } from '../i18n/sq'

const CONFIRM_PHRASE = 'FSHI TE GJITHA'

export default function AdminWipePanel({
  onWiped,
}: {
  onWiped: () => void
}) {
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const canSubmit =
    checked &&
    phrase.trim().toUpperCase() === CONFIRM_PHRASE &&
    password.length > 0 &&
    !busy

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    setOkMsg(null)

    const verify = await verifyAdminPassword(password)
    if (!verify.ok) {
      setBusy(false)
      setErr(verify.error || sq.wrongPassword)
      return
    }

    const { removed, error } = await wipeAllOrders({
      includeArchive: true,
      wipeSessions: true,
    })
    setBusy(false)
    if (error) {
      setErr(error)
      return
    }
    setOkMsg(sq.wipeDone(removed))
    setPassword('')
    setPhrase('')
    setChecked(false)
    onWiped()
  }

  return (
    <section className="dashboard-section sales-section wipe-panel">
      <h2 className="section-label">{sq.wipeTitle}</h2>
      <p className="wipe-warning">{sq.wipeWarning}</p>
      <form className="wipe-form" onSubmit={(e) => void submit(e)}>
        <label className="field-label" htmlFor="wipe-pass">
          {sq.adminPasswordConfirm}
        </label>
        <input
          id="wipe-pass"
          type="password"
          className="text-input wipe-input"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="field-label" htmlFor="wipe-phrase">
          {sq.typePhrase}: <code>{CONFIRM_PHRASE}</code>
        </label>
        <input
          id="wipe-phrase"
          type="text"
          className="text-input wipe-input"
          autoComplete="off"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={CONFIRM_PHRASE}
        />

        <label className="wipe-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          {sq.wipeCheckbox}
        </label>

        {err && <p className="form-error">{err}</p>}
        {okMsg && <p className="wipe-ok">{okMsg}</p>}

        <button
          type="submit"
          className="btn btn-danger btn-block btn-lg"
          disabled={!canSubmit}
        >
          {busy ? sq.wiping : sq.wipeConfirmBtn}
        </button>
      </form>
    </section>
  )
}
