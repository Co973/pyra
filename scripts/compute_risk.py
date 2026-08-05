"""Compute the documented, configurable heuristic regional risk score."""
from common import CONFIG, DATA, atomic_json, read_json, utc_now


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def main() -> None:
    config = read_json(CONFIG / "risk_weights.json")
    weather = read_json(DATA / "power_grid_latest.json", {"cells": {}})
    w, n, thresholds = config["weights"], config["normalization"], config["thresholds"]
    output = []
    for cell in weather.get("cells", {}).values():
        parts = {
            "temperature": clamp((cell["t2m"] - n["temperature_min_c"]) / n["temperature_range_c"]),
            "humidity": clamp((n["humidity_ceiling_pct"] - cell["rh2m"]) / n["humidity_ceiling_pct"]),
            "wind": clamp(cell["ws10m"] / n["wind_ceiling_ms"]),
            "dryness": clamp(1 - cell["precip_7d"] / n["rain_suppression_mm"]),
        }
        score = round(sum(w[name] * value for name, value in parts.items()), 3)
        bucket = "Extreme" if score >= thresholds["extreme"] else "High" if score >= thresholds["high"] else "Moderate" if score >= thresholds["moderate"] else "Low"
        output.append({"lat": cell["lat"], "lon": cell["lon"], "risk_score": score, "bucket": bucket, "weather": {"temp_c": cell["t2m"], "humidity_pct": cell["rh2m"], "wind_ms": cell["ws10m"], "wind_dir": cell["wd10m"], "rain_7d_mm": cell["precip_7d"]}})
    output.sort(key=lambda item: item["risk_score"], reverse=True)
    atomic_json(DATA / "risk_grid_latest.json", {"metadata": {"updated_at": utc_now(), "source": "NASA POWER + Pyra heuristic", "demo": False, "count": len(output)}, "cells": output})


if __name__ == "__main__":
    main()
