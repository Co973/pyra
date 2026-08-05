"""Generate a 2-degree land-only grid and cache it in the repository."""
from common import DATA, atomic_json, utc_now


def main() -> None:
    try:
        from global_land_mask import globe
    except ImportError as exc:
        raise SystemExit("Install requirements.txt to generate the land grid") from exc
    cells = []
    for lat in range(-89, 90, 2):
        for lon in range(-179, 180, 2):
            if globe.is_land(lat, lon):
                cells.append({"id": f"{lat:+03d}_{lon:+04d}", "lat": lat, "lon": lon})
    atomic_json(DATA / "land_grid_cache.json", {"metadata": {"updated_at": utc_now(), "resolution_deg": 2, "count": len(cells)}, "cells": cells})


if __name__ == "__main__":
    main()
