"""הביקוש לחשמל לפי מגזר, וההפחתות (פורט של src/model/demand.ts ו-src/model/measures.ts).

התרחישים הם dict-ים בצורת ה-JSON של הדשבורד (שמות שדות camelCase), והתוצאות הן dict-ים באותה צורה כמו
האובייקטים של ה-TypeScript, כך שאפשר להשוות אותן ישירות.
"""

from __future__ import annotations

import math
from typing import Any

from .core import SECONDS_PER_YEAR, linear_share, year_range

Scenario = dict[str, Any]
Sector = dict[str, Any]

NO_MEASURES = {"efficiency": 0, "saving": 0}


def _logistic(t: float, k: float, mid: float) -> float:
    return 1 / (1 + math.exp(-k * (t - mid)))


def sector_energy(sector: Sector, year: int, base_year: int, horizon_year: int) -> float:
    """הביקוש לחשמל של מגזר בשנה (J): linear / exp / s, ואחריו ההתייעלות השנתית של המגזר."""
    t = max(0, year - base_year)
    g = sector["growthRate"]
    base = sector["baseEnergy"]
    curve = sector["curve"]
    if curve == "linear":
        value = base * (1 + g * t)
    elif curve == "exp":
        value = base * math.pow(1 + g, t)
    else:
        T = max(1, horizon_year - base_year)
        target = base * math.pow(1 + g, T)
        mid = (sector.get("sMidYear") if sector.get("sMidYear") is not None else base_year + T / 2) - base_year
        k = 10 / T
        l0 = _logistic(0, k, mid)
        lT = _logistic(T, k, mid)
        f = t / T if lT == l0 else (_logistic(t, k, mid) - l0) / (lT - l0)
        value = base + (target - base) * f
    efficiency = math.pow(1 - sector["efficiencyRate"], t)
    return max(0.0, value * efficiency)


def sub_sector_energy(sector: Sector, sub: dict, year: int, base_year: int, horizon_year: int) -> float:
    """חשמל של תת-מגזר: חלקו מבסיס המגזר, באותה עקומה, בצמיחה שלו (או של המגזר)."""
    growth = sub.get("growthRate")
    if growth is None:
        growth = sector["growthRate"]
    return sector_energy(
        {**sector, "baseEnergy": sector["baseEnergy"] * sub["elecShare"], "growthRate": growth},
        year,
        base_year,
        horizon_year,
    )


def sector_total_energy(sector: Sector, year: int, base_year: int, horizon_year: int) -> float:
    """חשמל של מגזר: סכום תתי-המגזרים אם יש, אחרת המגזר עצמו."""
    subs = sector.get("subSectors") or []
    if not subs:
        return sector_energy(sector, year, base_year, horizon_year)
    total = 0.0
    for sub in subs:
        total += sub_sector_energy(sector, sub, year, base_year, horizon_year)
    return total


def peak_from_energy(energy: float, load_factor: float) -> float:
    """שיא (W) של אנרגיה שנתית (J): E / (שנה × load factor)."""
    return energy / (SECONDS_PER_YEAR * load_factor)


def project_demand(scenario: Scenario) -> list[dict]:
    """הביקוש של כל מגזר בכל שנה: {year, sector, energy, peak} (J, W)."""
    b, h = scenario["baseYear"], scenario["horizonYear"]
    out = []
    for year in year_range(b, h):
        for s in scenario["sectors"]:
            energy = sector_total_energy(s, year, b, h)
            out.append(
                {"year": year, "sector": s["key"], "energy": energy, "peak": peak_from_energy(energy, s["loadFactor"])}
            )
    return out


def project_sub_sectors(scenario: Scenario) -> list[dict]:
    """החשמל של כל תת-מגזר בכל שנה: {year, sector, subSector, energy, peak}."""
    b, h = scenario["baseYear"], scenario["horizonYear"]
    out = []
    for year in year_range(b, h):
        for s in scenario["sectors"]:
            for sub in s.get("subSectors") or []:
                energy = sub_sector_energy(s, sub, year, b, h)
                out.append(
                    {
                        "year": year,
                        "sector": s["key"],
                        "subSector": sub["key"],
                        "energy": energy,
                        "peak": peak_from_energy(energy, s["loadFactor"]),
                    }
                )
    return out


def demand_totals(points: list[dict]) -> list[dict]:
    """סך שנתי של המגזרים (השיא: סכום השיאים), ממוין לפי שנה."""
    by_year: dict[int, dict] = {}
    for p in points:
        t = by_year.setdefault(p["year"], {"year": p["year"], "energy": 0.0, "peak": 0.0})
        t["energy"] += p["energy"]
        t["peak"] += p["peak"]
    return [by_year[y] for y in sorted(by_year)]


def ramp_share(year: int, base_year: int, horizon_year: int) -> float:
    """0 בשנת הבסיס, עולה לינארית עד 1 בשנת האופק."""
    return linear_share(year, base_year, horizon_year)


def apply_measures(totals: list[dict], measures: dict | None, base_year: int, horizon_year: int) -> list[dict]:
    """מפחית התייעלות וחיסכון (כפל: (1 − e)(1 − s)) מאנרגיה ומשיא."""
    m = measures or NO_MEASURES
    out = []
    for t in totals:
        r = ramp_share(t["year"], base_year, horizon_year)
        e = m["efficiency"] * r
        s = m["saving"] * r
        after_eff = t["energy"] * (1 - e)
        net = after_eff * (1 - s)
        out.append(
            {
                "year": t["year"],
                "grossEnergy": t["energy"],
                "netEnergy": net,
                "grossPeak": t["peak"],
                "netPeak": t["peak"] * (1 - e) * (1 - s),
                "efficiencyEnergy": t["energy"] - after_eff,
                "savingEnergy": after_eff - net,
            }
        )
    return out


def net_totals(measured: list[dict]) -> list[dict]:
    """הביקוש נטו בצורה ש-compute_gap ו-auto_fill מצפים לה."""
    return [{"year": x["year"], "energy": x["netEnergy"], "peak": x["netPeak"]} for x in measured]
