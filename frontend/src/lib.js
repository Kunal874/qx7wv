import { useEffect, useState } from 'react'

/** GET a JSON endpoint; re-fetches when `url` changes and ignores stale responses. */
export function useApi(url) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fetch(url)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${r.status})`)
        return body
      })
      .then((data) => live && setState({ data }), (error) => live && setState({ error }))
    return () => { live = false }
  }, [url])
  return state
}

const UK = 'Europe/London'
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: UK, hour: '2-digit', minute: '2-digit' })
const dayLong = new Intl.DateTimeFormat('en-GB', { timeZone: UK, weekday: 'short', day: 'numeric', month: 'short' })

export const fmtClock = (iso) => clock.format(new Date(iso))
export const fmtDay = (iso) => dayLong.format(new Date(iso))
export const gw = (mw, digits = 1) => (mw == null ? '–' : (mw / 1000).toFixed(digits))
export const signedGw = (mw) => (mw > 0 ? '+' : '') + gw(mw)

/** Round GW axis ticks (0, 0.5, 1 … or 0, 5, 10 …) covering 0..maxMw. */
export function gwTicks(maxMw) {
  const step = [250, 500, 1000, 2500, 5000, 10000].find((s) => maxMw / s <= 5) ?? 10000
  return Array.from({ length: Math.ceil(maxMw / step) + 1 }, (_, i) => i * step)
}

export function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
