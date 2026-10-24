import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtClock, fmtDay, gw, gwTicks, shiftDate, signedGw, useApi } from './lib.js'
import { Card, Status, Tile, axisProps, tooltipProps } from './ui.jsx'

export default function DayView({ day, setDay, cutoff, window }) {
  const state = useApi(`/api/day?date=${day}&cutoff=${cutoff}`)
  const min = window?.first_day
  const max = window?.last_day

  return (
    <main>
      <div className="date-nav">
        <button onClick={() => setDay(shiftDate(day, -1))} disabled={day <= min} aria-label="Previous day">‹</button>
        <input type="date" value={day} min={min} max={max} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button onClick={() => setDay(shiftDate(day, 1))} disabled={day >= max} aria-label="Next day">›</button>
      </div>
      <Status state={state}>{(data) => <Day data={data} />}</Status>
    </main>
  )
}

function Day({ data }) {
  const points = data.points.map((p) => ({
    ...p,
    error: p.forecast != null && p.actual != null ? p.forecast - p.actual : null,
    range: p.low != null ? [p.low, p.high] : null,
  }))
  const published = [...new Set(points.map((p) => p.published).filter(Boolean))]
  const scored = points.filter((p) => p.error != null)
  const worst = scored.reduce((a, b) => (b.error > (a?.error ?? -Infinity) ? b : a), null)
  const outside = scored.filter((p) => p.actual < p.low || p.actual > p.high).length
  const s = data.stats
  const peak = Math.max(...points.flatMap((p) => [p.forecast, p.actual, p.high]).filter((v) => v != null))
  const yTicks = gwTicks(peak)

  return (
    <>
      <p className="context">
        Decision deadline <b>{fmtDay(data.cutoff_utc)}, {fmtClock(data.cutoff_utc)}</b>
        {published.length > 0 && (
          <> · latest forecast available was published <b>{published.map(fmtClock).join(' / ')}</b></>
        )}
      </p>

      {s && (
        <div className="tiles">
          <Tile label="Mean absolute error" value={gw(s.mae, 2)} unit="GW" note={`${s.nmae_pct.toFixed(0)}% of actual output`} />
          <Tile label="Bias (forecast − actual)" value={signedGw(s.bias)} unit="GW" note={s.bias > 0 ? 'Forecast too high: wind under-delivered' : 'Forecast too low: wind over-delivered'} />
          <Tile label="Largest shortfall" value={worst && worst.error > 0 ? gw(worst.error) : '0.0'} unit="GW" note={worst && worst.error > 0 ? `at ${fmtClock(worst.time)}` : 'no hour below forecast'} />
          <Tile label="Hours outside likely range" value={`${outside} / ${scored.length}`} note="Range = P10–P90 of January errors" />
        </div>
      )}

      <Card title="Wind generation: forecast at deadline vs actual" subtitle="GW, hourly. Shaded band: where actual wind landed 80% of the time in January, given the forecast.">
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="time" tickFormatter={fmtClock} interval={2} {...axisProps} />
            <YAxis tickFormatter={(v) => v / 1000} ticks={yTicks} domain={[0, yTicks.at(-1)]} {...axisProps} axisLine={false} />
            <Tooltip {...tooltipProps} labelFormatter={(t) => `${fmtDay(t)} ${fmtClock(t)}`} formatter={tooltipValue} />
            <Legend wrapperStyle={{ fontSize: 13, color: 'var(--ink-2)' }} />
            <Area dataKey="range" name="Likely range (P10–P90)" stroke="none" fill="var(--band)" isAnimationActive={false} />
            <Line dataKey="forecast" name="Forecast at deadline" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="actual" name="Actual" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <details className="card">
        <summary>Hourly table</summary>
        <table>
          <thead>
            <tr><th>Hour</th><th>Forecast (MW)</th><th>Published</th><th>Actual (MW)</th><th>Error (MW)</th><th>Likely range (MW)</th></tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.time}>
                <td>{fmtClock(p.time)}</td>
                <td>{p.forecast ?? '–'}</td>
                <td>{p.published ? fmtClock(p.published) : '–'}</td>
                <td>{p.actual ?? '–'}</td>
                <td>{p.error ?? '–'}</td>
                <td>{p.range ? `${Math.round(p.low)}–${Math.round(p.high)}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}

function tooltipValue(value, name) {
  if (Array.isArray(value)) return [`${gw(value[0])}–${gw(value[1])} GW`, name]
  return [`${gw(value, 2)} GW`, name]
}
