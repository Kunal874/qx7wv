"""Fetch wind actuals (FUELHH) and forecasts (WINDFOR) from the public Elexon BMRS API."""
import json
from datetime import date, timedelta
from functools import lru_cache
from urllib.parse import urlencode
from urllib.request import urlopen

from . import analysis

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"

# Purchase decisions made in January 2026 are for delivery on 2 Jan .. 1 Feb.
FIRST_DAY = date(2026, 1, 2)
LAST_DAY = date(2026, 2, 1)
# WINDFOR looks ~3 days ahead, so fetch from 4 days earlier to see every forecast of the first day.
PUBLISH_FROM = FIRST_DAY - timedelta(days=4)


def _get(dataset, **params):
    with urlopen(f"{BASE}/{dataset}/stream?{urlencode(params)}", timeout=30) as r:
        return json.load(r)


@lru_cache(maxsize=1)  # ponytail: in-process cache; the data is historical so never stale, refetched on cold start
def load():
    """Return (forecast index, actuals index) for the delivery window. ~20k forecast rows, one call each."""
    forecasts = _get(
        "WINDFOR",
        publishDateTimeFrom=f"{PUBLISH_FROM}T00:00:00Z",
        publishDateTimeTo=f"{LAST_DAY + timedelta(days=1)}T00:00:00Z",
    )
    actuals = _get("FUELHH", settlementDateFrom=FIRST_DAY, settlementDateTo=LAST_DAY, fuelType="WIND")
    return analysis.index_forecasts(forecasts), analysis.index_actuals(actuals)
