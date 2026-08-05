"""Fetch a bounded, resumable batch of trailing 7-day NASA POWER weather."""
from __future__ import annotations

import os
import time
from datetime import date, timedelta

from common import DATA, atomic_json, get, read_json, utc_now

URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = "T2M,RH2M,WS10M,WD10M,PRECTOTCORR"


def values(parameter: dict) -> list[float]:
    return [float(v) for v in parameter.values() if isinstance(v, (int, float)) and v > -900]


def main() -> None:
    grid = read_json(DATA / "land_grid_cache.json", {"cells": []}).get("cells", [])
    if not grid:
        raise SystemExit("Land grid is missing; run scripts/land_mask.py first.")
    size = max(1, int(os.environ.get("POWER_BATCH_SIZE", "250")))
    index = max(0, int(os.environ.get("POWER_BATCH_INDEX", "0")))
    start_at = (index * size) % len(grid)
    batch = (grid + grid)[start_at:start_at + min(size, len(grid))]
    today = date.today()
    start = (today - timedelta(days=7)).strftime("%Y%m%d")
    end = (today - timedelta(days=1)).strftime("%Y%m%d")
    existing = read_json(DATA / "power_grid_latest.json", {"cells": {}})
    cached = existing.get("cells", {})
    failures = []

    for offset, cell in enumerate(batch):
        try:
            response = get(URL, params={"parameters": PARAMETERS, "community": "AG", "longitude": cell["lon"], "latitude": cell["lat"], "start": start, "end": end, "format": "JSON"}, timeout=45)
            p = response.json()["properties"]["parameter"]
            temps, humid, winds, directions, rain = (values(p.get(code, {})) for code in ("T2M", "RH2M", "WS10M", "WD10M", "PRECTOTCORR"))
            if not all((temps, humid, winds, directions)):
                raise ValueError("missing weather values")
            cached[cell["id"]] = {
                "lat": cell["lat"], "lon": cell["lon"], "date": end,
                "t2m": temps[-1], "rh2m": humid[-1], "ws10m": winds[-1], "wd10m": directions[-1],
                "precip_7d": round(sum(rain), 2), "fetched_at": utc_now(),
            }
        except Exception as exc:
            failures.append({"cell": cell["id"], "error": str(exc)[:160]})
        if offset and offset % 25 == 0:
            time.sleep(0.5)

    atomic_json(DATA / "power_grid_latest.json", {
        "metadata": {"updated_at": utc_now(), "source": "NASA POWER", "batch_index": index, "batch_size": len(batch), "total_cached": len(cached), "failures": failures},
        "cells": cached,
    })


if __name__ == "__main__":
    main()
