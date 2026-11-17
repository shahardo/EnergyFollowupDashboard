"""פותר את המודל ומסכם את התוצאות במונחי הדשבורד: הספק וייצור לכל מקור, פליטות ועלות לכל שנה."""

from __future__ import annotations

import time
from typing import Any

from .build import DemandSource, RunMode, build_model
from .mapping import PJ_PER_TWH, REGION, is_capacity_tech, model_capacity_per_gw, source_technologies

#: הגבלת זמן ברירת המחדל לפתרון (שניות).
DEFAULT_TIME_LIMIT = 1800
#: טון CO₂ במיליון טון.
T_PER_MT = 1e6


def _series(da, **sel) -> dict:
    """{שנה: ערך} של משתנה פתרון, אחרי בחירה וסיכום של כל שאר הממדים."""
    x = da.sel(REGION=REGION, **sel) if "REGION" in da.dims else da.sel(**sel)
    for d in list(x.dims):
        if d != "YEAR":
            x = x.sum(d)
    return {int(y): float(v) for y, v in zip(x["YEAR"].values, x.values)}


def summarize(model, solution) -> dict[str, Any]:
    """הספק (GW), ייצור חשמל ומימן ויבוא דלקים (TWh) לכל מקור ושנה, ופליטות ועלות לכל שנה."""
    techs = {t.id: t for t in model.technologies}
    present = set(solution["GrossCapacity"].coords["TECHNOLOGY"].values)
    years = [int(y) for y in solution["GrossCapacity"].coords["YEAR"].values]
    raw_techs = {t["id"]: t for t in _raw_technologies(model)}
    capacity, production = [], []
    for key, ids in source_technologies().items():
        ids = [t for t in ids if t in present and t in techs]
        if not ids:
            continue
        gw = dict.fromkeys(years, 0.0)
        elec = dict.fromkeys(years, 0.0)
        h2 = dict.fromkeys(years, 0.0)
        fuel = dict.fromkeys(years, 0.0)
        for tid in ids:
            raw = raw_techs[tid]
            if is_capacity_tech(raw):
                f = model_capacity_per_gw(raw)
                for y, v in _series(solution["GrossCapacity"], TECHNOLOGY=tid).items():
                    gw[y] += v / f
            else:
                for y, v in _series(solution["TotalTechnologyAnnualActivity"], TECHNOLOGY=tid).items():
                    fuel[y] += v / PJ_PER_TWH
            prod = solution["ProductionByTechnology"]
            fuels = set(prod.coords["FUEL"].values)
            if "Electricity" in fuels:
                for y, v in _series(prod, TECHNOLOGY=tid, FUEL="Electricity").items():
                    elec[y] += v / PJ_PER_TWH
            if "Hydrogen" in fuels and tid.startswith("H2_"):
                for y, v in _series(prod, TECHNOLOGY=tid, FUEL="Hydrogen").items():
                    h2[y] += v / PJ_PER_TWH
        for y in years:
            capacity.append({"year": y, "source": key, "gw": gw[y]})
            production.append(
                {"year": y, "source": key, "electricityTWh": elec[y], "hydrogenTWh": h2[y], "fuelImportTWh": fuel[y]}
            )
    em = solution["AnnualTechnologyEmission"]
    co2 = _series(em, EMISSION="CO2") if "CO2" in set(em.coords["EMISSION"].values) else dict.fromkeys(years, 0.0)
    cost = _series(solution["TotalDiscountedCost"])
    return {
        "years": years,
        "capacity": capacity,
        "production": production,
        "emissions": [{"year": y, "mtCo2": co2.get(y, 0.0) / T_PER_MT} for y in years],
        "cost": [{"year": y, "discountedCost": cost.get(y, 0.0)} for y in years],
        "objective": float(sum(cost.values())),
    }


def _raw_technologies(model) -> list[dict]:
    """הטכנולוגיות כ-dict (לזיהוי תחנות ויחידות), מהמודל שנבנה."""
    return getattr(model, "_raw_technologies", None) or [
        {
            "id": t.id,
            "operating_modes": [_mode_dict(m) for m in t.operating_modes],
            "capacity_activity_unit_ratio": _ratio(t),
        }
        for t in model.technologies
    ]


def _mode_dict(mode) -> dict:
    out = mode.output_activity_ratio.data if mode.output_activity_ratio is not None else {}
    # OSeMOSYSData: {region: {commodity: {year: v}}} → רק שמות הסחורות חשובים כאן
    commodities = set()
    for v in out.values():
        commodities.update(v.keys() if isinstance(v, dict) else [])
    return {"output_activity_ratio": dict.fromkeys(commodities, 1)}


def _ratio(t) -> float:
    data = t.capacity_activity_unit_ratio.data
    return float(data.get(REGION, 1.0)) if isinstance(data, dict) else float(data)


def run(
    demand: dict | None,
    supply: dict | None,
    run_mode: RunMode = "free",
    demand_source: DemandSource = "dashboard",
    time_limit: float = DEFAULT_TIME_LIMIT,
) -> dict[str, Any]:
    """בונה, פותר ומסכם. status: "optimal", או "failed" עם termination של הפותר."""
    t0 = time.monotonic()
    model = build_model(demand, supply, run_mode, demand_source)
    status, termination = model.solve(solver_name="highs", time_limit=time_limit)
    elapsed = time.monotonic() - t0
    if status != "ok":
        return {"status": "failed", "termination": str(termination), "seconds": elapsed}
    out = summarize(model, model.solution)
    return {"status": "optimal", "termination": str(termination), "seconds": elapsed, **out}
