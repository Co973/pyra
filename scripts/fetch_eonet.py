"""Fetch curated open wildfire events from NASA EONET."""
from common import DATA, atomic_json, get, utc_now


def main() -> None:
    payload = get("https://eonet.gsfc.nasa.gov/api/v3/events", params={"category": "wildfires", "status": "open", "limit": 200}).json()
    events = []
    for event in payload.get("events", []):
        geometry = event.get("geometry") or []
        latest = geometry[-1] if geometry else {}
        coords = latest.get("coordinates") or []
        if latest.get("type") != "Point" or len(coords) < 2:
            continue
        sources = event.get("sources") or []
        source_url = sources[0].get("url") if sources else None
        gdacs_url = next((source.get("url") for source in sources if "gdacs.org" in (source.get("url") or "").lower()), None)
        events.append({
            "id": event.get("id"), "title": event.get("title", "Confirmed wildfire"),
            "lat": coords[1], "lon": coords[0], "date": latest.get("date"),
            "url": source_url, "gdacs_url": gdacs_url,
        })
    atomic_json(DATA / "eonet_latest.json", {"metadata": {"updated_at": utc_now(), "source": "NASA EONET", "demo": False}, "events": events})


if __name__ == "__main__":
    main()
