"""Mirror publishable JSON into the GitHub Pages directory."""
import shutil

from common import DATA, ROOT

FILES = ("fires_latest.json", "risk_grid_latest.json", "spread_projection_latest.json", "eonet_latest.json", "validation_log.json")


def main() -> None:
    target = ROOT / "docs" / "data"
    target.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        source = DATA / name
        if source.exists():
            shutil.copy2(source, target / name)


if __name__ == "__main__":
    main()
