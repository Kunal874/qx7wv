"""Pure analysis logic: which forecast a trader had at the decision cutoff, and how wrong it was.

Error convention everywhere: error = forecast - actual (MW).
Positive error = wind under-delivered = the team must buy more power than planned.
"""
from bisect import bisect_right
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from math import floor, sqrt
from statistics import fmean, quantiles
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")
HOUR = timedelta(hours=1)


def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def index_forecasts(rows):
    """WINDFOR rows -> {startTime: ([publishTime...], [MW...])}, sorted by publishTime for bisecting."""
    by_start = defaultdict(list)
    for r in rows:
        by_start[parse_ts(r["startTime"])].append((parse_ts(r["publishTime"]), r["generation"]))
    out = {}
    for start, items in by_start.items():
        items.sort()
        out[start] = ([p for p, _ in items], [g for _, g in items])
    return out


def index_actuals(rows):
    """FUELHH rows -> {startTime: MW}."""
    return {parse_ts(r["startTime"]): r["generation"] for r in rows}


def decision_cutoff(delivery_day, cutoff):
    """Day-ahead decisions are made at `cutoff` (UK local time) on the day before delivery."""
    return datetime.combine(delivery_day - timedelta(days=1), cutoff, UK).astimezone(UTC)


def delivery_hours(day):
    """Hourly UTC start times of a UK delivery day (23 or 25 hours on clock-change days)."""
    start = datetime.combine(day, time(0), UK).astimezone(UTC)
    end = datetime.combine(day + timedelta(days=1), time(0), UK).astimezone(UTC)
    return [start + i * HOUR for i in range(int((end - start) / HOUR))]


def latest_forecast(forecasts, start, cutoff):
    """(publishTime, MW) of the newest forecast for `start` published at or before `cutoff`, else None."""
    if start not in forecasts:
        return None
    pubs, gens = forecasts[start]
    i = bisect_right(pubs, cutoff)
    return (pubs[i - 1], gens[i - 1]) if i else None


def day_points(day, cutoff, forecasts, actuals):
    """One row per delivery hour: the forecast available at the cutoff, and what actually happened."""
    at = decision_cutoff(day, cutoff)
    points = []
    for start in delivery_hours(day):
        f = latest_forecast(forecasts, start, at)
        points.append({
            "time": start,
            "forecast": f[1] if f else None,
            "published": f[0] if f else None,
            "actual": actuals.get(start),
        })
    return points


def forecast_errors(points):
    return [p["forecast"] - p["actual"] for p in points if p["forecast"] is not None and p["actual"] is not None]


def error_stats(points):
    pairs = [p for p in points if p["forecast"] is not None and p["actual"] is not None]
    if not pairs:
        return None
    errors = forecast_errors(pairs)
    q = quantiles(errors, n=10, method="inclusive") if len(errors) > 1 else errors * 9
    mae = fmean(abs(e) for e in errors)
    return {
        "n": len(errors),
        "mae": mae,
        "rmse": sqrt(fmean(e * e for e in errors)),
        "bias": fmean(errors),
        "nmae_pct": mae / fmean(p["actual"] for p in pairs) * 100,
        "p10": q[0],
        "p50": q[4],
        "p90": q[8],
    }


def add_band(points, p10, p90):
    """Likely range of actual generation (P10-P90) given the forecast and historical error spread."""
    def band(f):
        return (None, None) if f is None else (max(0, f - p90), max(0, f - p10))
    return [{**p, **dict(zip(("low", "high"), band(p["forecast"])))} for p in points]


def by_hour(points):
    """MAE and bias per UK hour of day."""
    groups = defaultdict(list)
    for p in points:
        if p["forecast"] is not None and p["actual"] is not None:
            groups[p["time"].astimezone(UK).hour].append(p["forecast"] - p["actual"])
    return [
        {"hour": h, "mae": fmean(abs(e) for e in es), "bias": fmean(es), "n": len(es)}
        for h, es in sorted(groups.items())
    ]


def histogram(errors, width=500):
    counts = defaultdict(int)
    for e in errors:
        counts[floor(e / width)] += 1
    lo, hi = min(counts), max(counts)
    return [{"from_mw": b * width, "to_mw": (b + 1) * width, "count": counts[b]} for b in range(lo, hi + 1)]


def lead_time_mae(forecasts, actuals, window_start, window_end, bucket_h=6):
    """MAE of every forecast for target hours in [window_start, window_end), grouped by hours ahead."""
    groups = defaultdict(list)
    for start, (pubs, gens) in forecasts.items():
        if not window_start <= start < window_end or start not in actuals:
            continue
        for published, mw in zip(pubs, gens):
            lead = (start - published) / HOUR
            if lead >= 0:  # WINDFOR also re-publishes hours already in the past
                groups[int(lead // bucket_h)].append(abs(mw - actuals[start]))
    return [
        {"from_h": b * bucket_h, "to_h": (b + 1) * bucket_h, "mae": fmean(es), "n": len(es)}
        for b, es in sorted(groups.items())
    ]
