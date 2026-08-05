"""Cluster nearby fire points and create illustrative wind-only growth cones."""
from __future__ import annotations

import math

from common import CONFIG, DATA, atomic_json, read_json, utc_now


def distance_km(a: dict, b: dict) -> float:
    dy = (a["lat"] - b["lat"]) * 111.0
    dx = (a["lon"] - b["lon"]) * 111.0 * math.cos(math.radians((a["lat"] + b["lat"]) / 2))
    return math.hypot(dx, dy)


def destination(lat: float, lon: float, bearing: float, distance: float) -> list[float]:
    radius = 6371.0
    phi1, lam1, theta, delta = map(math.radians, (lat, lon, bearing, distance / radius * 180 / math.pi))
    phi2 = math.asin(math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta))
    lam2 = lam1 + math.atan2(math.sin(theta) * math.sin(delta) * math.cos(phi1), math.cos(delta) - math.sin(phi1) * math.sin(phi2))
    return [round(math.degrees(phi2), 5), round((math.degrees(lam2) + 540) % 360 - 180, 5)]


def cone(lat: float, lon: float, bearing: float, length: float, half_angle: float) -> list[list[float]]:
    points = [[lat, lon]]
    for step in range(13):
        angle = bearing - half_angle + (2 * half_angle * step / 12)
        points.append(destination(lat, lon, angle, length))
    points.append([lat, lon])
    return points


def main() -> None:
    fires = read_json(DATA / "fires_latest.json", {"fires": []}).get("fires", [])
    weather = list(read_json(DATA / "power_grid_latest.json", {"cells": {}}).get("cells", {}).values())
    settings = read_json(CONFIG / "risk_weights.json")["spread"]
    clusters: list[list[dict]] = []
    for fire in fires:
        match = next((cluster for cluster in clusters if distance_km(fire, cluster[0]) <= settings["cluster_radius_km"]), None)
        if match is None:
            clusters.append([fire])
        else:
            match.append(fire)
    projections = []
    for index, cluster in enumerate(clusters):
        lat = sum(f["lat"] for f in cluster) / len(cluster)
        lon = sum(f["lon"] for f in cluster) / len(cluster)
        if not weather:
            continue
        nearest = min(weather, key=lambda cell: distance_km({"lat": lat, "lon": lon}, cell))
        downwind = (nearest["wd10m"] + 180) % 360
        ros = settings["base_rate_kmh"] * (1 + min(3, max(0, nearest["ws10m"] / 10)))
        projections.append({
            "fire_id": f"cluster-{index + 1}", "centroid": {"lat": round(lat, 5), "lon": round(lon, 5)}, "detections": len(cluster),
            "ros_kmh": round(ros, 2), "wind_dir": nearest["wd10m"], "downwind_dir": round(downwind, 1),
            "cone_6h": cone(lat, lon, downwind, ros * 6, settings["cone_half_angle_deg"]),
            "cone_24h": cone(lat, lon, downwind, ros * 24, settings["cone_half_angle_deg"]),
        })
    atomic_json(DATA / "spread_projection_latest.json", {"metadata": {"updated_at": utc_now(), "method": "illustrative wind-only proxy", "demo": False}, "projections": projections})


if __name__ == "__main__":
    main()
