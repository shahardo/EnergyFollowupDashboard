"""ההיצע לפי מקור, והפער מול הביקוש (פורט של src/model/supply.ts, gap.ts ו-series.ts)."""

from __future__ import annotations

from typing import Any

from .core import HOURS_PER_YEAR_K, INF, round2, year_range
from .demand import apply_measures, demand_totals, net_totals, project_demand

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
        return srt[0]["gw"]
    last = srt[-1]
    if year >= last["year"]:
        return last["gw"]
    for i in range(1, len(srt)):
        a, b = srt[i - 1], srt[i]
        if year <= b["year"]:
            return a["gw"] + ((b["gw"] - a["gw"]) * (year - a["year"])) / (b["year"] - a["year"])
    return last["gw"]


def energy_twh(gw: float, cf: float) -> float:
    """TWh בשנה: GW × CF × 8.76."""
    return gw * cf * HOURS_PER_YEAR_K


def source_capacity(source: Source, year: int) -> float:
    """ההספק המותקן של מקור בשנה, אחרי ההפעלה ושנת ההוצאה משימוש."""
    if not source["enabled"]:
        return 0.0
    retire = source.get("retireYear")
    if retire is not None and year >= retire:
        return 0.0
    return interpolate_capacity(source["capacityGW"], year)


def compute_supply(scenario: SupplyScenario, years: list[int]) -> list[dict]:
    """{year, source, gw, twh, firmGW} לכל מקור ושנה."""
    out = []
    for year in years:
        for s in scenario["sources"]:
            gw = source_capacity(s, year)
            out.append(
                {
                    "year": year,
                    "source": s["key"],
                    "gw": gw,
                    "twh": energy_twh(gw, s["capacityFactor"]),
                    "firmGW": gw * s["capacityCredit"],
                }
            )
    return out


def set_capacity_at(points: list[dict], year: int, gw: float) -> list[dict]:
    """קובע את ההספק בשנה: מעדכן את נקודת השנה או מוסיף אחת; ממוין לפי שנה."""
    if any(p["year"] == year for p in points):
        nxt = [{"year": year, "gw": gw} if p["year"] == year else p for p in points]
    else:
        nxt = [*points, {"year": year, "gw": gw}]
    return sorted(nxt, key=lambda p: p["year"])


def scale_capacity_from(points: list[dict], from_year: int, horizon_year: int, gw: float) -> list[dict]:
    """קובע את ההספק באופק ל-gw ומכפיל את הנקודות מ-from_year עד האופק באותו יחס (כמו scaleCapacityFrom)."""
    old = interpolate_capacity(points, horizon_year)
    if old <= 0 or from_year >= horizon_year or not points:
        return set_capacity_at(points, horizon_year, gw)
    factor = gw / old
    nxt = set_capacity_at(points, horizon_year, old)
    first_year = nxt[0]["year"]
    if from_year > first_year and not any(p["year"] == from_year for p in nxt):
        nxt = set_capacity_at(nxt, from_year, interpolate_capacity(points, from_year))
    out = []
    for p in nxt:
        if p["year"] == horizon_year:
            out.append({"year": p["year"], "gw": gw})
        elif from_year <= p["year"] < horizon_year:
            out.append({"year": p["year"], "gw": round2(p["gw"] * factor)})
        else:
            out.append(p)
    return out


def _pct(part: float, whole: float) -> float:
    return (part / whole) * 100 if whole > 0 else 100.0


def compute_gap(demand: list[dict], supply: list[dict], scenario: SupplyScenario) -> list[dict]:
    """הפער בכל שנה: אנרגיה מול ייצור, שיא מול הספק יציב, וחלק המתחדשות."""
    renewable = {s["key"] for s in scenario["sources"] if s["renewable"]}
    by_year: dict[int, dict] = {}
    for p in supply:
        t = by_year.setdefault(p["year"], {"twh": 0.0, "firm": 0.0, "renewable": 0.0})
        t["twh"] += p["twh"]
        t["firm"] += p["firmGW"]
        if p["source"] in renewable:
            t["renewable"] += p["twh"]
    out = []
    for d in demand:
        t = by_year.get(d["year"], {"twh": 0.0, "firm": 0.0, "renewable": 0.0})
        twh, firm, ren = t["twh"], t["firm"], t["renewable"]
        out.append(
            {
                "year": d["year"],
                "demandTWh": d["twh"],
                "supplyTWh": twh,
                "gapTWh": max(0.0, d["twh"] - twh),
                "coveragePct": _pct(twh, d["twh"]),
                "peakDemandGW": d["peakGW"],
                "firmGW": firm,
                "peakGapGW": max(0.0, d["peakGW"] - firm),
                "peakCoveragePct": _pct(firm, d["peakGW"]),
                "renewablePct": (ren / twh) * 100 if twh > 0 else 0.0,
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
    "energy_twh",
    "interpolate_capacity",
    "scale_capacity_from",
    "set_capacity_at",
    "source_capacity",
]
