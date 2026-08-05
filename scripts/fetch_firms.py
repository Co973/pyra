"""Fetch, filter, and deduplicate global NASA FIRMS detections."""
from __future__ import annotations

import csv
import io
import os
from datetime import datetime, timezone

from common import DATA, atomic_json, get, utc_now

SOURCES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT")
BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


def keep(row: dict[str, str], source: str) -> bool:
    confidence = str(row.get("confidence", "")).strip().lower()
    if source.startswith("VIIRS"):
        return confidence != "low"
    try:
        return float(confidence) >= 30
    except ValueError:
        return False


def normalize(row: dict[str, str], source: str) -> dict:
    date = row.get("acq_date", "")
    raw_time = str(row.get("acq_time", "0")).zfill(4)
    timestamp = f"{date}T{raw_time[:2]}:{raw_time[2:]}:00Z"
    return {
        "lat": round(float(row["latitude"]), 5),
        "lon": round(float(row["longitude"]), 5),
        "frp": round(float(row.get("frp") or 0), 2),
        "confidence": row.get("confidence", "unknown"),
        "acq_datetime": timestamp,
        "satellite": row.get("satellite") or source.replace("_NRT", ""),
        "daynight": row.get("daynight", ""),
    }


def main() -> None:
    key = os.environ.get("FIRMS_MAP_KEY")
    if not key:
        raise SystemExit("FIRMS_MAP_KEY is required; add it as a GitHub Actions secret.")

    records: list[dict] = []
    errors: list[str] = []
    for source in SOURCES:
        try:
            response = get(f"{BASE}/{key}/{source}/-180,-90,180,90/2", timeout=120)
            for row in csv.DictReader(io.StringIO(response.text)):
                if row.get("latitude") and keep(row, source):
                    records.append(normalize(row, source))
        except Exception as exc:  # preserve partial successful sources
            errors.append(f"{source}: {exc}")

    if not records:
        raise SystemExit("No FIRMS records received; existing published data was preserved. " + "; ".join(errors))

    # One representative per ~1 km / minute, retaining the strongest overlapping reading.
    dedup: dict[tuple, dict] = {}
    for fire in records:
        key_tuple = (round(fire["lat"], 2), round(fire["lon"], 2), fire["acq_datetime"][:16])
        if key_tuple not in dedup or fire["frp"] > dedup[key_tuple]["frp"]:
            dedup[key_tuple] = fire
    fires = sorted(dedup.values(), key=lambda item: item["acq_datetime"], reverse=True)
    payload = {
        "metadata": {"updated_at": utc_now(), "source": "NASA FIRMS", "demo": False, "count": len(fires), "warnings": errors},
        "fires": fires,
    }
    atomic_json(DATA / "fires_latest.json", payload)
    atomic_json(DATA / "fire_history" / f"{datetime.now(timezone.utc).date().isoformat()}.json", payload)


if __name__ == "__main__":
    main()
