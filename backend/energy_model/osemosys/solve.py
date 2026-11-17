"""פותר את המודל ומחזיר את התוצאות במונחי הדשבורד וב-SI: הספק (W) וייצור (J) לכל מקור, יבוא דלקים (J), תמהיל
הנשאים של כל מגזר (J), פליטות (kg) ועלות ($) לכל שנה."""

from __future__ import annotations

import time
from typing import Any

from ..data import catalog
from .build import (
    CARRIER_TAG,
    J_PER_PJ,
    KG_PER_MT,
    USD_PER_MUSD,
    W_PER_GW,
    RunMode,
    build_model,
    energy_system,
    sector_commodities,
)

#: הגבלת זמן ברירת המחדל לפתרון (שניות).
DEFAULT_TIME_LIMIT = 1800


def _series(da, **sel) -> dict[int, float]:
    """{שנה: ערך} של משתנה פתרון, אחרי בחירה וסיכום של כל שאר הממדים."""
    x = da.sel(**sel)
    for d in list(x.dims):
        if d != "YEAR":
            x = x.sum(d)
    return {int(y): float(v) for y, v in zip(x["YEAR"].values, x.values)}


def _has(da, dim: str, value: str) -> bool:
    return value in set(da.coords[dim].values)


def summarize(solution) -> dict[str, Any]:
    """התוצאות של פתרון, ב-SI."""
    cap = solution["GrossCapacity"]
    prod = solution["ProductionByTechnology"]
    activity = solution["TotalTechnologyAnnualActivity"]
    years = [int(y) for y in cap.coords["YEAR"].values]
    zero = dict.fromkeys(years, 0.0)

    def tech(da, tid: str, scale: float, **sel) -> dict[int, float]:
        if not _has(da, "TECHNOLOGY", tid) or any(not _has(da, k, v) for k, v in sel.items()):
            return zero
        return {y: v * scale for y, v in _series(da, TECHNOLOGY=tid, **sel).items()}

    imports: dict[str, dict[int, float]] = {}
    for f in energy_system()["fuelImports"]:
        acc = imports.setdefault(f["source"], dict(zero))
        for y, v in tech(activity, f"IMP_{f['commodity']}", J_PER_PJ).items():
            acc[y] += v

    capacity, production = [], []
    for s in catalog()["sources"]:
        tid = s["technology"]
        power = tech(cap, tid, W_PER_GW)
        elec = tech(prod, tid, J_PER_PJ, FUEL="Electricity")
        h2 = tech(prod, tid, J_PER_PJ, FUEL="Hydrogen")
        fuel = imports.get(s["key"], zero)
        for y in years:
            capacity.append({"year": y, "source": s["key"], "power": power[y]})
            production.append(
                {"year": y, "source": s["key"], "electricity": elec[y], "hydrogen": h2[y], "fuelImport": fuel[y]}
            )

    # תמהיל הנשאים: האנרגיה הסופית שכל טכנולוגיית שימוש צורכת (הפעילות = התפוקה השימושית, חלקי היעילות)
    end_use = []
    kinds = sector_commodities()
    kind_of = {v["commodity"]: v["kind"] for v in kinds.values()}
    by_tag = {tag: carrier for carrier, tag in CARRIER_TAG.items()}
    for tid in (str(t) for t in activity.coords["TECHNOLOGY"].values):
        if not tid.startswith("USE_"):
            continue
        commodity, tag = tid[4:].rsplit("_", 1)
        carrier = by_tag.get(tag)
        if carrier is None or commodity not in kind_of:
            continue
        eff = energy_system()["endUse"][kind_of[commodity]][carrier]["efficiency"]
        series = tech(activity, tid, J_PER_PJ / eff)
        end_use += [{"year": y, "commodity": commodity, "carrier": carrier, "energy": series[y]} for y in years]

    em = solution["AnnualTechnologyEmission"]
    co2 = _series(em, EMISSION="CO2") if _has(em, "EMISSION", "CO2") else zero
    cost = _series(solution["TotalDiscountedCost"])
    return {
        "years": years,
        "capacity": capacity,
        "production": production,
        "endUse": end_use,
        "emissions": [{"year": y, "co2": co2.get(y, 0.0) * KG_PER_MT} for y in years],
        "cost": [{"year": y, "discountedCost": cost.get(y, 0.0) * USD_PER_MUSD} for y in years],
        "objective": float(sum(cost.values())) * USD_PER_MUSD,
    }


def run(
    demand: dict, supply: dict, run_mode: RunMode = "free", time_limit: float = DEFAULT_TIME_LIMIT
) -> dict[str, Any]:
    """בונה, פותר ומסכם. status: "optimal", או "failed" עם termination של הפותר."""
    t0 = time.monotonic()
    model = build_model(demand, supply, run_mode)
    status, termination = model.solve(solver_name="highs", time_limit=time_limit)
    elapsed = time.monotonic() - t0
    if status != "ok":
        return {"status": "failed", "termination": str(termination), "seconds": elapsed}
    return {"status": "optimal", "termination": str(termination), "seconds": elapsed, **summarize(model.solution)}
