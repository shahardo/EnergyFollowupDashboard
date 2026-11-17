"""הביקוש לחשמל לפי מגזר, וההפחתות (פורט של src/model/demand.ts ו-src/model/measures.ts).

התרחישים הם dict-ים בצורת ה-JSON של הדשבורד (שמות שדות camelCase), והתוצאות הן dict-ים באותה צורה כמו
האובייקטים של ה-TypeScript, כך שאפשר להשוות אותן ישירות.
"""

from __future__ import annotations

import math
from typing import Any

from .core import HOURS_PER_YEAR_K, linear_share, year_range

Scenario = dict[str, Any]
Sector = dict[str, Any]

NO_MEASURES = {"efficiencyPct": 0, "savingPct": 0}


def _logistic(t: float, k: float, mid: float) -> float:
    return 1 / (1 + math.exp(-k * (t - mid)))


def sector_twh(sector: Sector, year: int, base_year: int, horizon_year: int) -> float:
    """הביקוש של מגזר בשנה (TWh): linear / exp / s, ואחריו ההתייעלות השנתית של המגזר."""
    t = max(0, year - base_year)
    g = sector["growthPct"] / 100
    base = sector["baseTWh"]
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
    efficiency = math.pow(1 - sector["efficiencyPct"] / 100, t)
    return max(0.0, value * efficiency)


def sub_sector_twh(sector: Sector, sub: dict, year: int, base_year: int, horizon_year: int) -> float:
    """חשמל של תת-מגזר: חלקו מבסיס המגזר, באותה עקומה, בצמיחה שלו (או של המגזר)."""
    growth = sub.get("growthPct")
    if growth is None:
        growth = sector["growthPct"]
    return sector_twh(
        {**sector, "baseTWh": sector["baseTWh"] * sub["elecShare"], "growthPct": growth},
        year,
        base_year,
        horizon_year,
    )


def sector_total_twh(sector: Sector, year: int, base_year: int, horizon_year: int) -> float:
    """חשמל של מגזר: סכום תתי-המגזרים אם יש, אחרת המגזר עצמו."""
    subs = sector.get("subSectors") or []
    if not subs:
        return sector_twh(sector, year, base_year, horizon_year)
    total = 0.0
    for sub in subs:
        total += sub_sector_twh(sector, sub, year, base_year, horizon_year)
    return total


def peak_from_energy(twh: float, load_factor: float) -> float:
    """GW = TWh / (8.76 × load factor)"""
    return twh / (HOURS_PER_YEAR_K * load_factor)


def project_demand(scenario: Scenario) -> list[dict]:
    """הביקוש של כל מגזר בכל שנה: {year, sector, twh, peakGW}."""
    b, h = scenario["baseYear"], scenario["horizonYear"]
    out = []
    for year in year_range(b, h):
        for s in scenario["sectors"]:
            twh = sector_total_twh(s, year, b, h)
            out.append({"year": year, "sector": s["key"], "twh": twh, "peakGW": peak_from_energy(twh, s["loadFactor"])})
    return out


def project_sub_sectors(scenario: Scenario) -> list[dict]:
    """החשמל של כל תת-מגזר בכל שנה: {year, sector, subSector, twh, peakGW}."""
    b, h = scenario["baseYear"], scenario["horizonYear"]
    out = []
    for year in year_range(b, h):
        for s in scenario["sectors"]:
            for sub in s.get("subSectors") or []:
                twh = sub_sector_twh(s, sub, year, b, h)
                out.append(
                    {
                        "year": year,
                        "sector": s["key"],
                        "subSector": sub["key"],
                        "twh": twh,
                        "peakGW": peak_from_energy(twh, s["loadFactor"]),
                    }
                )
    return out


def demand_totals(points: list[dict]) -> list[dict]:
    """סך שנתי של המגזרים (השיא: סכום השיאים), ממוין לפי שנה."""
    by_year: dict[int, dict] = {}
    for p in points:
        t = by_year.setdefault(p["year"], {"year": p["year"], "twh": 0.0, "peakGW": 0.0})
        t["twh"] += p["twh"]
        t["peakGW"] += p["peakGW"]
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
        e = (m["efficiencyPct"] / 100) * r
        s = (m["savingPct"] / 100) * r
        after_eff = t["twh"] * (1 - e)
        net = after_eff * (1 - s)
        out.append(
            {
                "year": t["year"],
                "grossTWh": t["twh"],
                "netTWh": net,
                "grossPeakGW": t["peakGW"],
                "netPeakGW": t["peakGW"] * (1 - e) * (1 - s),
                "efficiencyTWh": t["twh"] - after_eff,
                "savingTWh": after_eff - net,
            }
        )
    return out


def net_totals(measured: list[dict]) -> list[dict]:
    """הביקוש נטו בצורה ש-compute_gap ו-auto_fill מצפים לה."""
    return [{"year": x["year"], "twh": x["netTWh"], "peakGW": x["netPeakGW"]} for x in measured]
