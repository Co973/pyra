# Pyra — Global Wildfire Intelligence

Pyra is a static, globally scoped wildfire dashboard backed by scheduled GitHub Actions. It combines near-real-time NASA FIRMS thermal detections, NASA POWER weather observations, and NASA EONET confirmed events into three layers: active fires, a regional heuristic fire-weather risk score, and simplified wind-only spread projections.

> **Not for emergency use.** Pyra is a portfolio and learning project. It is not an evacuation, incident-command, or operational forecasting tool. Always follow local authorities and official fire services.

## What the model does

The risk score is a transparent heuristic—not the Canadian FWI, NFDRS, or a calibrated scientific product. For each land-grid point it combines temperature (25%), low relative humidity (30%), wind speed (20%), and trailing seven-day dryness (25%). Weights and thresholds are editable in `config/risk_weights.json`.

Spread cones are illustrative. They assume flat terrain, uniform fuels, and wind as the only directional driver. They do not account for slope, fuel type, fuel moisture, suppression, or spotting.

FIRMS detections can be delayed or hidden by satellite timing, cloud, and canopy. The 2° regional grid is coarse and must not be interpreted at property scale.

## Local preview

Serve the repository root so `docs/` can load its mirrored data:

```bash
python -m http.server 8000 --directory docs
```

Then open `http://localhost:8000`.

The repository includes representative demo data so the interface is useful before the first automated refresh. Demo records are visibly labeled in the UI.

## Live data setup

1. Request a free FIRMS MAP key at <https://firms.modaps.eosdis.nasa.gov/api/>.
2. In the GitHub repository, add an Actions secret named `FIRMS_MAP_KEY`.
3. In **Settings → Actions → General**, allow workflows read/write permissions.
4. Enable GitHub Pages using the `docs/` folder on the default branch.
5. Run **Fetch active fires** once, then **Update risk and spread**.

The fire workflow runs every three hours. The risk workflow runs daily and supports bounded batches because a full 2° land grid can exceed a single NASA POWER/API run. Configure `POWER_BATCH_SIZE` and `POWER_BATCH_INDEX` when manually dispatching, or let the daily workflow rotate batches automatically.

## Data pipeline

- `scripts/fetch_firms.py`: downloads, filters, and deduplicates global VIIRS/MODIS detections.
- `scripts/fetch_eonet.py`: downloads NASA-curated open wildfire events.
- `scripts/land_mask.py`: builds a cached 2° land grid using the optional `global-land-mask` package.
- `scripts/fetch_power_grid.py`: fetches trailing 7-day POWER weather for a bounded grid batch, with retry/backoff and cache preservation.
- `scripts/compute_risk.py`: evaluates the documented risk formula.
- `scripts/compute_spread.py`: clusters nearby detections and creates 6h/24h downwind cones.
- `scripts/validate.py`: archives weekly risk snapshots and records forward-window bucket outcomes.
- `scripts/sync_docs_data.py`: copies publishable JSON into `docs/data/` for GitHub Pages.

All scripts use atomic writes. A failed upstream call leaves the last known-good published data intact.

## Validation

Each daily run stores a dated risk snapshot. Once a snapshot is at least seven days old, validation checks whether cells in each risk bucket saw a subsequent FIRMS detection and appends aggregate hit rates to `data/validation_log.json`. This is evidence for future weight tuning, not a claim of scientific accuracy.

## License

MIT. NASA data are subject to their respective source terms and attribution requirements.
