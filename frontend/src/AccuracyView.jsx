import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { gw, gwTicks, signedGw } from './lib.js'
import { Card, Status, Tile, axisProps, tooltipProps } from './ui.jsx'

export default function AccuracyView({ state, cutoff }) {
  return (
    <main>
      <Status state={state}>{(data) => <Accuracy data={data} cutoff={cutoff} />}</Status>
    </main>
  )
}

function Accuracy({ data, cutoff }) {
  const s = data.stats
  const [h, m] = cutoff.split(':').map(Number)
  const deadline = h + m / 60
  const shortHours = data.histogram.filter((b) => b.from_mw >= 0).reduce((n, b) => n + b.count, 0)
  const hours = [...data.by_hour].sort((a, b) => a.mae - b.mae)
  const lead = data.lead_time.map((r) => ({ ...r, mid: (r.from_h + r.to_h) / 2 }))
  const hourTicks = gwTicks(hours.at(-1).mae)
  const leadTicks = gwTicks(Math.max(...lead.map((r) => r.mae)))

  return (
    <>
      <p className="hero">
        Across {s.n} delivery hours ({data.window.first_day} → {data.window.last_day}), the forecast available at
        the <b>{cutoff}</b> deadline was off by <b>{gw(s.mae)} GW</b> on average ({s.nmae_pct.toFixed(0)}% of output)
        and ran <b>{gw(Math.abs(s.bias))} GW too {s.bias > 0 ? 'high' : 'low'}</b>.
      </p>

      <div className="tiles">
        <Tile label="Mean absolute error" value={gw(s.mae, 2)} unit="GW" note={`${s.nmae_pct.toFixed(1)}% of mean actual output`} />
        <Tile label="RMSE" value={gw(s.rmse, 2)} unit="GW" note="Weights big misses more" />
        <Tile label="Bias (forecast − actual)" value={signedGw(s.bias)} unit="GW" note={s.bias > 0 ? 'Forecast systematically too high' : 'Forecast systematically too low'} />
        <Tile label="Backup to cover 9 in 10 hours" value={gw(Math.max(0, s.p90))} unit="GW" note="P90 of shortfall vs forecast" />
      </div>

      <div className="grid-2">
        <Card title="How big are the misses?" subtitle={`Hours by forecast error (forecast − actual), GW. ${Math.round((shortHours / s.n) * 100)}% of hours wind came in below forecast.`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.histogram} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap={2}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="from_mw" tickFormatter={(v) => gw(v)} {...axisProps} />
              <YAxis {...axisProps} axisLine={false} allowDecimals={false} />
              <Tooltip {...tooltipProps} labelFormatter={(v) => `${gw(v)} to ${gw(v + 500)} GW`} formatter={(v) => [v, 'Hours']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.histogram.map((b) => <Cell key={b.from_mw} fill={b.from_mw >= 0 ? 'var(--shortfall)' : 'var(--surplus)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="legend-row">
            <span className="swatch" style={{ background: 'var(--surplus)' }} /> Wind above forecast (surplus)
            <span className="swatch" style={{ background: 'var(--shortfall)' }} /> Wind below forecast (buy more)
          </p>
        </Card>

        <Card title="Error by hour of day" subtitle={`Mean absolute error, GW. Best ${String(hours[0].hour).padStart(2, '0')}:00 (${gw(hours[0].mae)} GW), worst ${String(hours.at(-1).hour).padStart(2, '0')}:00 (${gw(hours.at(-1).mae)} GW).`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_hour} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap={2}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="hour" tickFormatter={(v) => String(v).padStart(2, '0')} interval={2} {...axisProps} />
              <YAxis tickFormatter={(v) => v / 1000} ticks={hourTicks} domain={[0, hourTicks.at(-1)]} {...axisProps} axisLine={false} />
              <Tooltip {...tooltipProps} labelFormatter={(v) => `${String(v).padStart(2, '0')}:00 UK`} formatter={(v) => [`${gw(v, 2)} GW`, 'MAE']} />
              <Bar dataKey="mae" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Fresher forecasts are more accurate" subtitle={`MAE of every January forecast by how far ahead it was published. Error grows from ${gw(lead[0].mae)} GW (0–6 h ahead) to ${gw(lead.at(-1).mae)} GW (${lead.at(-1).from_h}–${lead.at(-1).to_h} h ahead). Shaded: lead times a ${cutoff} day-ahead decision has to live with.`}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={lead} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <ReferenceArea x1={24 - deadline} x2={48 - deadline} fill="var(--hover)" stroke="none" label={{ value: 'Day-ahead window', position: 'insideTop', fill: 'var(--muted)', fontSize: 12 }} />
            <XAxis dataKey="mid" type="number" domain={[0, 72]} ticks={[0, 12, 24, 36, 48, 60, 72]} tickFormatter={(v) => `${v} h`} {...axisProps} />
            <YAxis tickFormatter={(v) => v / 1000} ticks={leadTicks} domain={[0, leadTicks.at(-1)]} {...axisProps} axisLine={false} />
            <Tooltip {...tooltipProps} labelFormatter={(_, p) => p?.[0] ? `${p[0].payload.from_h}–${p[0].payload.to_h} h ahead (${p[0].payload.n} forecasts)` : ''} formatter={(v) => [`${gw(v, 2)} GW`, 'MAE']} />
            <Line dataKey="mae" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </>
  )
}
