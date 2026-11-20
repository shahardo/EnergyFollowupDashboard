"""ההיצע לפי מקור, והפער מול הביקוש (פורט של src/model/supply.ts, gap.ts ו-series.ts)."""

from __future__ import annotations

from typing import Any

from .core import INF, round_power, year_range
from .demand import apply_measures, demand_totals, net_totals, project_demand
from .units import energy_of

Source = dict[str, Any]
SupplyScenario = dict[str, Any]

#: סליידר מקור משנה את הנקודות משנה זו ואילך.
SCALE_FROM_YEAR = 2030


def interpolate_capacity(points: list[dict], year: float) -> float:
    """אינטרפולציה לינארית בין נקודות העוגן; לפני הראשונה ואחרי האחרונה הערך קבוע."""
    if not points:
        return 0.0
    srt = (
        points
        if all(i == 0 or points[i - 1]["year"] <= p["year"] for i, p in enumerate(points))
        else sorted(points, key=lambda p: p["year"])
    )
    if year <= srt[0]["year"]:
        return srt[0]["power"]
    last = srt[-1]
    if year >= last["year"]:
        return last["power"]
    for i in range(1, len(srt)):
        a, b = srt[i - 1], srt[i]
        if year <= b["year"]:
            return a["power"] + ((b["power"] - a["power"]) * (year - a["year"])) / (b["year"] - a["year"])
    return last["power"]


def source_energy(power: float, cf: float) -> float:
    """האנרגיה בשנה (J) של הספק (W) במקדם ניצול cf."""
    return energy_of(power, cf)


def source_capacity(source: Source, year: int) -> float:
    """ההספק המותקן של מקור בשנה, אחרי ההפעלה ושנת ההוצאה משימוש."""
    if not source["enabled"]:
        return 0.0
    retire = source.get("retireYear")
    if retire is not None and year >= retire:
        return 0.0
    return interpolate_capacity(source["capacity"], year)


def compute_supply(scenario: SupplyScenario, years: list[int]) -> list[dict]:
    """{year, source, power, energy, firmPower} לכל מקור ושנה (W, J, W)."""
    out = []
    for year in years:
        for s in scenario["sources"]:
            power = source_capacity(s, year)
            out.append(
                {
                    "year": year,
                    "source": s["key"],
                    "power": power,
                    "energy": source_energy(power, s["capacityFactor"]),
                    "firmPower": power * s["capacityCredit"],
                }
            )
    return out


def set_capacity_at(points: list[dict], year: int, power: float) -> list[dict]:
    """קובע את ההספק בשנה: מעדכן את נקודת השנה או מוסיף אחת; ממוין לפי שנה."""
    if any(p["year"] == year for p in points):
        nxt = [{"year": year, "power": power} if p["year"] == year else p for p in points]
    else:
        nxt = [*points, {"year": year, "power": power}]
    return sorted(nxt, key=lambda p: p["year"])


def scale_capacity_from(points: list[dict], from_year: int, horizon_year: int, power: float) -> list[dict]:
    """קובע את ההספק באופק ל-power (W) ומכפיל את הנקודות מ-from_year עד האופק באותו יחס (כמו scaleCapacityFrom)."""
    old = interpolate_capacity(points, horizon_year)
    if old <= 0 or from_year >= horizon_year or not points:
        return set_capacity_at(points, horizon_year, power)
    factor = power / old
    nxt = set_capacity_at(points, horizon_year, old)
    first_year = nxt[0]["year"]
    if from_year > first_year and not any(p["year"] == from_year for p in nxt):
        nxt = set_capacity_at(nxt, from_year, interpolate_capacity(points, from_year))
    out = []
    for p in nxt:
        if p["year"] == horizon_year:
            out.append({"year": p["year"], "power": power})
        elif from_year <= p["year"] < horizon_year:
            out.append({"year": p["year"], "power": round_power(p["power"] * factor)})
        else:
            out.append(p)
    return out


def _share(part: float, whole: float) -> float:
    return part / whole if whole > 0 else 1.0


def compute_gap(demand: list[dict], supply: list[dict], scenario: SupplyScenario) -> list[dict]:
    """הפער בכל שנה: אנרגיה מול ייצור, שיא מול הספק יציב, וחלק המתחדשות."""
    renewable = {s["key"] for s in scenario["sources"] if s["renewable"]}
    by_year: dict[int, dict] = {}
    for p in supply:
        t = by_year.setdefault(p["year"], {"energy": 0.0, "firm": 0.0, "renewable": 0.0})
        t["energy"] += p["energy"]
        t["firm"] += p["firmPower"]
        if p["source"] in renewable:
            t["renewable"] += p["energy"]
    out = []
    for d in demand:
        t = by_year.get(d["year"], {"energy": 0.0, "firm": 0.0, "renewable": 0.0})
        energy, firm, ren = t["energy"], t["firm"], t["renewable"]
        out.append(
            {
                "year": d["year"],
                "demandEnergy": d["energy"],
                "supplyEnergy": energy,
                "gapEnergy": max(0.0, d["energy"] - energy),
                "coverage": _share(energy, d["energy"]),
                "peakDemand": d["peak"],
                "firmPower": firm,
                "peakGap": max(0.0, d["peak"] - firm),
                "peakCoverage": _share(firm, d["peak"]),
                "renewableShare": ren / energy if energy > 0 else 0.0,
            }
        )
    return out


def compute_demand_series(demand: dict) -> dict:
    """ביקוש לפי מגזר → סך ברוטו → הפחתות → ביקוש נטו."""
    years = year_range(demand["baseYear"], demand["horizonYear"])
    points = project_demand(demand)
    gross = demand_totals(points)
    measured = apply_measures(gross, demand.get("measures"), demand["baseYear"], demand["horizonYear"])
    return {
        "years": years,
        "demandPoints": points,
        "grossTotals": gross,
        "measured": measured,
        "totals": net_totals(measured),
    }


def compute_series(d: dict, supply: SupplyScenario) -> dict:
    """משלים את צד ההיצע והפער לסדרות ביקוש."""
    points = compute_supply(supply, d["years"])
    return {**d, "supplyPoints": points, "gap": compute_gap(d["totals"], points, supply)}


__all__ = [
    "INF",
    "SCALE_FROM_YEAR",
    "compute_demand_series",
    "compute_gap",
    "compute_series",
    "compute_supply",
    "source_energy",
    "interpolate_capacity",
    "scale_capacity_from",
    "set_capacity_at",
    "source_capacity",
]
