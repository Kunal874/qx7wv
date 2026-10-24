from datetime import UTC, date, datetime, time
from math import sqrt

import pytest

from backend import analysis as an


def ts(s):
    return datetime.fromisoformat(s).replace(tzinfo=UTC)


def test_cutoff_is_uk_local_time_on_day_before_delivery():
    # January is GMT (UTC+0), July is BST (UTC+1)
    assert an.decision_cutoff(date(2026, 1, 10), time(9, 20)) == ts("2026-01-09T09:20")
    assert an.decision_cutoff(date(2026, 7, 10), time(9, 20)) == ts("2026-07-09T08:20")


def test_delivery_day_follows_uk_clock_changes():
    assert len(an.delivery_hours(date(2026, 1, 10))) == 24
    assert an.delivery_hours(date(2026, 1, 10))[0] == ts("2026-01-10T00:00")
    assert len(an.delivery_hours(date(2026, 3, 29))) == 23  # clocks go forward
    assert len(an.delivery_hours(date(2026, 10, 25))) == 25  # clocks go back


FORECASTS = an.index_forecasts([
    {"publishTime": "2026-01-09T09:30:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 900},
    {"publishTime": "2026-01-09T07:30:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 700},
    {"publishTime": "2026-01-09T04:30:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 400},
])


@pytest.mark.parametrize("cutoff, expected", [
    ("2026-01-09T09:20", ("2026-01-09T07:30", 700)),  # EPEX closes before the 09:30 publish
    ("2026-01-09T09:30", ("2026-01-09T09:30", 900)),  # published exactly at cutoff counts
    ("2026-01-09T09:50", ("2026-01-09T09:30", 900)),  # N2EX gets the fresher one
])
def test_latest_forecast_at_cutoff(cutoff, expected):
    published, mw = an.latest_forecast(FORECASTS, ts("2026-01-10T12:00"), ts(cutoff))
    assert (published, mw) == (ts(expected[0]), expected[1])


def test_no_forecast_before_cutoff_or_for_unknown_hour():
    assert an.latest_forecast(FORECASTS, ts("2026-01-10T12:00"), ts("2026-01-09T00:00")) is None
    assert an.latest_forecast(FORECASTS, ts("2026-01-10T13:00"), ts("2026-01-09T09:20")) is None


def test_day_points_pair_forecast_with_actual():
    actuals = an.index_actuals([{"startTime": "2026-01-10T12:00:00Z", "generation": 650}])
    points = an.day_points(date(2026, 1, 10), time(9, 20), FORECASTS, actuals)
    noon = next(p for p in points if p["time"] == ts("2026-01-10T12:00"))
    assert (noon["forecast"], noon["actual"], noon["published"]) == (700, 650, ts("2026-01-09T07:30"))
    assert points[0]["forecast"] is None and points[0]["actual"] is None


def test_error_stats():
    points = [{"forecast": f, "actual": a} for f, a in [(10, 12), (20, 18), (30, 30), (5, None)]]
    s = an.error_stats(points)  # errors (forecast - actual): -2, 2, 0
    assert s["n"] == 3
    assert s["mae"] == pytest.approx(4 / 3)
    assert s["rmse"] == pytest.approx(sqrt(8 / 3))
    assert s["bias"] == pytest.approx(0)
    assert s["nmae_pct"] == pytest.approx(4 / 3 / 20 * 100)
    assert (s["p10"], s["p50"], s["p90"]) == pytest.approx((-1.6, 0, 1.6))
    assert an.error_stats([{"forecast": None, "actual": 1}]) is None


def test_band_brackets_actual_using_error_percentiles():
    # error = forecast - actual, so actual ranges from forecast - p90 to forecast - p10
    points = an.add_band([{"forecast": 1000}, {"forecast": 100}, {"forecast": None}], p10=-200, p90=300)
    assert [(p.get("low"), p.get("high")) for p in points] == [(700, 1200), (0, 300), (None, None)]


def test_lead_time_mae_buckets_by_hours_ahead():
    forecasts = an.index_forecasts([
        {"publishTime": "2026-01-10T09:00:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 110},  # 3h ahead
        {"publishTime": "2026-01-10T04:00:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 70},   # 8h ahead
        {"publishTime": "2026-01-10T13:00:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 100},  # after the fact
    ])
    actuals = {ts("2026-01-10T12:00"): 100}
    rows = an.lead_time_mae(forecasts, actuals, ts("2026-01-10T00:00"), ts("2026-01-11T00:00"), bucket_h=6)
    assert rows == [{"from_h": 0, "to_h": 6, "mae": 10, "n": 1}, {"from_h": 6, "to_h": 12, "mae": 30, "n": 1}]


def test_histogram_and_hourly_breakdown():
    assert an.histogram([-600, -100, 100, 499], width=500) == [
        {"from_mw": -1000, "to_mw": -500, "count": 1},
        {"from_mw": -500, "to_mw": 0, "count": 1},
        {"from_mw": 0, "to_mw": 500, "count": 2},
    ]
    points = [
        {"time": ts("2026-01-10T06:00"), "forecast": 10, "actual": 4},
        {"time": ts("2026-01-11T06:00"), "forecast": 10, "actual": 12},
        {"time": ts("2026-01-11T07:00"), "forecast": 10, "actual": None},
    ]
    assert an.by_hour(points) == [{"hour": 6, "mae": 4, "bias": 2, "n": 2}]
