export function Tile({ label, value, unit, note }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">
        {value}
        {unit && <span className="tile-unit"> {unit}</span>}
      </div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}

export function Card({ title, subtitle, children }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {subtitle && <p className="muted">{subtitle}</p>}
      {children}
    </section>
  )
}

/** Shows loading / error states; renders children only once data exists. */
export function Status({ state, children }) {
  if (state.error) return <p className="error">Could not load data: {state.error.message}</p>
  if (!state.data) return <p className="muted loading">Loading Elexon data…</p>
  return <div className={state.loading ? 'stale' : undefined}>{children(state.data)}</div>
}

export const axisProps = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--muted)', fontSize: 12 },
  tickLine: false,
}

export const tooltipProps = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--ink)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--ink-2)', marginBottom: 4 },
  cursor: { stroke: 'var(--axis)', fill: 'var(--hover)' },
}
