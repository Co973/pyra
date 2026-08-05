"""Archive risk snapshots and validate mature snapshots against later fires."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from common import DATA, atomic_json, read_json, utc_now


def cell_key(lat: float, lon: float) -> tuple[int, int]:
    return (round((lat - 1) / 2) * 2 + 1, round((lon - 1) / 2) * 2 + 1)


def main() -> None:
    risk = read_json(DATA / "risk_grid_latest.json", {"cells": []})
    snapshots = DATA / "risk_history"
    snapshots.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).date()
    atomic_json(snapshots / f"{today.isoformat()}.json", risk)
    log = read_json(DATA / "validation_log.json", {"metadata": {}, "runs": []})
    seen = {run["snapshot_date"] for run in log.get("runs", [])}
    for path in sorted(snapshots.glob("*.json")):
        snapshot_date = datetime.strptime(path.stem, "%Y-%m-%d").date()
        if path.stem in seen or snapshot_date > today - timedelta(days=7):
            continue
        fire_cells = set()
        for fire_path in sorted((DATA / "fire_history").glob("*.json")):
            fire_date = datetime.strptime(fire_path.stem, "%Y-%m-%d").date()
            if snapshot_date < fire_date <= snapshot_date + timedelta(days=7):
                later_fires = read_json(fire_path, {"fires": []}).get("fires", [])
                fire_cells.update(cell_key(f["lat"], f["lon"]) for f in later_fires)
        if not fire_cells:
            continue
        counts = {bucket: {"cells": 0, "with_fire": 0} for bucket in ("Low", "Moderate", "High", "Extreme")}
        for cell in read_json(path, {"cells": []}).get("cells", []):
            bucket = cell["bucket"]
            counts[bucket]["cells"] += 1
            counts[bucket]["with_fire"] += int(cell_key(cell["lat"], cell["lon"]) in fire_cells)
        log.setdefault("runs", []).append({"snapshot_date": path.stem, "evaluated_at": utc_now(), "by_bucket": counts})
    log["metadata"] = {"updated_at": utc_now(), "method": "7-day forward detection by 2-degree cell"}
    atomic_json(DATA / "validation_log.json", log)


if __name__ == "__main__":
    main()
