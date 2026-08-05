"""Generate a 2-degree land-only grid and cache it in the repository."""
from common import DATA, atomic_json, utc_now


FALLBACK_LAND_BOXES = (
    # North America, Central America, Caribbean
    (7, 72, -168, -52),
    # South America
    (-56, 13, -82, -34),
    # Europe
    (35, 72, -12, 45),
    # Africa
    (-35, 38, -18, 52),
    # Asia
    (5, 78, 45, 180),
    # Southeast Asia and Indonesia
    (-12, 25, 95, 155),
    # Australia
    (-44, -10, 112, 154),
    # New Zealand
    (-48, -34, 166, 179),
    # Madagascar
    (-26, -12, 43, 51),
)


def fallback_is_land(lat: int, lon: int) -> bool:
    return any(min_lat <= lat <= max_lat and min_lon <= lon <= max_lon for min_lat, max_lat, min_lon, max_lon in FALLBACK_LAND_BOXES)


def main() -> None:
    demo = False
    try:
        from global_land_mask import globe
    except ImportError as exc:
        globe = None
        demo = True
        print(f"global-land-mask is unavailable ({exc}); using built-in coarse land boxes.")
    cells = []
    for lat in range(-89, 90, 2):
        for lon in range(-179, 180, 2):
            is_land = globe.is_land(lat, lon) if globe else fallback_is_land(lat, lon)
            if is_land:
                cells.append({"id": f"{lat:+03d}_{lon:+04d}", "lat": lat, "lon": lon})
    atomic_json(DATA / "land_grid_cache.json", {"metadata": {"updated_at": utc_now(), "resolution_deg": 2, "count": len(cells), "fallback": demo}, "cells": cells})


if __name__ == "__main__":
    main()
