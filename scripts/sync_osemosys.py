"""Refresh the vendored copy of the OSeMOSYS Israel model (backend/energy_model/osemosys/data).

Usage: python scripts/sync_osemosys.py [<commit or branch>]   (default: the commit in catalog.json)

Clones https://github.com/shahardo/osemosys_israel at that commit into a temporary folder, copies the model
YAML and its generator, records the reference objective from results/TotalDiscountedCost.xlsx (needs openpyxl),
and writes SOURCE.md. Then update "osemosysSource.commit" in src/data/catalog.json and re-run the tests.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "backend" / "energy_model" / "osemosys" / "data"
REPO = "https://github.com/shahardo/osemosys_israel"


def main() -> int:
    catalog = json.loads((ROOT / "src" / "data" / "catalog.json").read_text(encoding="utf-8"))
    ref = sys.argv[1] if len(sys.argv) > 1 else catalog["osemosysSource"]["commit"]
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "repo"
        subprocess.run(["git", "clone", "-q", REPO, str(src)], check=True)
        subprocess.run(["git", "-C", str(src), "checkout", "-q", ref], check=True)
        commit = subprocess.run(["git", "-C", str(src), "rev-parse", "HEAD"], check=True, capture_output=True, text=True)
        sha = commit.stdout.strip()
        DEST.mkdir(parents=True, exist_ok=True)
        shutil.copy(src / "osemosys_data_yaml" / "israel_energy_model.yaml", DEST / "israel_energy_model.yaml")
        shutil.copy(src / "gen_osemosys_files.py", DEST / "gen_osemosys_files.py")
        reference = {}
        xlsx = src / "results" / "TotalDiscountedCost.xlsx"
        if xlsx.exists():
            import pandas as pd

            df = pd.read_excel(xlsx)
            reference = {"totalDiscountedCost": float(df["TotalDiscountedCost"].sum()), "solver": "upstream results/"}
        (DEST / "reference.json").write_text(json.dumps(reference, indent=2) + "\n", encoding="utf-8")
    (DEST / "SOURCE.md").write_text(
        f"# Vendored OSeMOSYS Israel model\n\n"
        f"- Source: {REPO}\n- Commit: `{sha}`\n"
        f"- Files: `israel_energy_model.yaml` (the tz-osemosys model), `gen_osemosys_files.py` (its generator),\n"
        f"  `reference.json` (the total discounted cost in the repo's `results/`, used by the tests).\n\n"
        f"Do not edit these files here: change the model in osemosys_israel and re-run `python scripts/sync_osemosys.py`.\n"
        f"Our additions (sectors and sources the dashboard has and the model lacked) are in `../additions.yaml`.\n",
        encoding="utf-8",
    )
    print(f"vendored {sha[:7]} into {DEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
