from datetime import date, time, timedelta
from pathlib import Path
from urllib.error import URLError

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from . import analysis, elexon

app = FastAPI(title="Wind Forecast Monitor")

CUTOFF = Query("09:20", pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="UK time on the day before delivery")


def _data():
    try:
        return elexon.load()
    except (URLError, TimeoutError, ValueError) as e:
        raise HTTPException(502, f"Elexon API unavailable: {e}") from e


def _window_points(cutoff, forecasts, actuals):
    days = (elexon.FIRST_DAY + timedelta(days=i) for i in range((elexon.LAST_DAY - elexon.FIRST_DAY).days + 1))
    return [p for d in days for p in analysis.day_points(d, cutoff, forecasts, actuals)]


@app.get("/api/accuracy")
def accuracy(cutoff: str = CUTOFF):
    """Accuracy of the forecasts the team actually had at the cutoff, across all January decisions."""
    forecasts, actuals = _data()
    points = _window_points(time.fromisoformat(cutoff), forecasts, actuals)
    start = analysis.delivery_hours(elexon.FIRST_DAY)[0]
    end = analysis.delivery_hours(elexon.LAST_DAY)[-1] + analysis.HOUR
    return {
        "window": {"first_day": elexon.FIRST_DAY, "last_day": elexon.LAST_DAY},
        "cutoff": cutoff,
        "stats": analysis.error_stats(points),
        "by_hour": analysis.by_hour(points),
        "histogram": analysis.histogram(analysis.forecast_errors(points)),
        "lead_time": analysis.lead_time_mae(forecasts, actuals, start, end),
    }


@app.get("/api/day")
def day(date_: date = Query(alias="date"), cutoff: str = CUTOFF):
    """Hourly forecast-at-cutoff vs actual for one delivery day, with a P10-P90 band from January's errors."""
    if not elexon.FIRST_DAY <= date_ <= elexon.LAST_DAY:
        raise HTTPException(422, f"date must be between {elexon.FIRST_DAY} and {elexon.LAST_DAY}")
    forecasts, actuals = _data()
    t = time.fromisoformat(cutoff)
    month = analysis.error_stats(_window_points(t, forecasts, actuals))
    points = analysis.day_points(date_, t, forecasts, actuals)
    return {
        "date": date_,
        "cutoff_utc": analysis.decision_cutoff(date_, t),
        "points": analysis.add_band(points, month["p10"], month["p90"]),
        "stats": analysis.error_stats(points),
    }


# In Docker the built React app is served from here; on Vercel it is served as static files instead.
_web = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _web.is_dir():
    app.mount("/", StaticFiles(directory=_web, html=True), name="web")
