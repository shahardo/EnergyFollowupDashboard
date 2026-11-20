"""מייצא את המודל שנבנה מהנתונים של הדשבורד בפריסה של osemosys_israel, כך שאפשר להחליף בו את הקלט שם.

    python -m energy_model.osemosys.export --demand medium --policy declared [--mode free] --out <dir>

נכתבים <dir>/osemosys_data_yaml/israel_energy_model.yaml (קובץ tz-osemosys אחד, נטען עם Model.from_yaml)
ו-<dir>/osemosys_data_yaml/README.md (מאיפה הוא בא, היחידות, ואיך לייצר אותו מחדש).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import yaml

from ..data import demand_preset, supply_preset
from .build import PJ_PER_GW_YEAR, RunMode, build_model_dict

MODEL_FILE = "israel_energy_model.yaml"

README = """# Israel energy model (generated)

This model is generated from the energy dashboard's data (https://github.com/shahardo/EnergyFollowupDashboard):
the demand scenario `{demand}`, the supply policy `{policy}` and `src/data/energySystem.json`, in run mode `{mode}`.
Do not edit it by hand: change the dashboard's JSON files and export again with

    cd backend && python -m energy_model.osemosys.export --demand {demand} --policy {policy} --mode {mode} --out <dir>

The dashboard's JSON files are the single source of the data, in base SI units. This export is in the units the
solver works best with: activity in PJ, capacity in GW (`capacity_activity_unit_ratio` = {ratio:.3f} PJ per
GW-year), costs in millions of US$ (capex / opex_fixed per GW, opex_variable per PJ), emissions in Mt CO2eq per PJ.
Years {first}–{last}, {slices} timeslices. All values are sample data.

Solve it with tz-osemosys:

    from tz.osemosys import Model
    model = Model.from_yaml("{file}")
    model.solve(solver_name="highs")
"""


def export(demand_key: str, policy: str, out: Path, mode: RunMode = "free") -> Path:
    """כותב את המודל ואת ה-README; מחזיר את הנתיב של קובץ המודל."""
    model = build_model_dict(demand_preset(demand_key), supply_preset(demand_key, policy), mode)
    folder = out / "osemosys_data_yaml"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / MODEL_FILE
    path.write_text(yaml.safe_dump(model, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")
    years = model["time_definition"]["years"]
    (folder / "README.md").write_text(
        README.format(
            demand=demand_key,
            policy=policy,
            mode=mode,
            ratio=PJ_PER_GW_YEAR,
            first=years[0],
            last=years[-1],
            slices=len(model["time_definition"]["timeslices"]),
            file=f"osemosys_data_yaml/{MODEL_FILE}",
        ),
        encoding="utf-8",
    )
    return path


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--demand", default="medium", choices=["low", "medium", "high"])
    p.add_argument("--policy", default="declared", choices=["reference", "declared", "tested"])
    p.add_argument("--mode", default="free", choices=["free", "capped", "follow"])
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    print(export(a.demand, a.policy, a.out, a.mode))


if __name__ == "__main__":
    main()
