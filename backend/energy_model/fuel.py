"""המרות ליחידות אנרגיה, גז ופליטות (פורט של src/model/fuel.ts). כל המקדמים הם ערכי דוגמה, כמו בדשבורד."""

from __future__ import annotations

#: מיליון שעט"ן (Mtoe) ב-TWh אחד.
TOE_PER_TWH = 0.086
#: תוכן האנרגיה של מיליארד מ"ק גז טבעי (TWh תרמי).
TWH_TH_PER_BCM = 10.3

PRIMARY_EFFICIENCY = {
    "gas": 0.5,
    "lng": 0.5,
    "coal": 0.38,
    "importFossil": 0.4,
    "importClean": 0.4,
    "hydrogenImport": 0.5,
    "other": 0.4,
    "nuclear": 0.33,
    "fusion": 0.33,
    "geothermal": 0.1,
    "gasCcs": 0.42,
    "hydrogenPower": 0.55,
    "hydrogenGreen": 0.5,
    "hydrogenBlue": 0.5,
    "wte": 0.25,
    "csp": 1,
}

GAS_SOURCES = ("gas", "lng", "gasCcs")

EMISSION_FACTOR = {
    "gas": 0.49,
    "lng": 0.55,
    "coal": 0.82,
    "importFossil": 0.65,
    "other": 0.5,
    "solar": 0.048,
    "solar30": 0.048,
    "solar40": 0.048,
    "wind": 0.011,
    "geothermal": 0.038,
    "nuclear": 0.012,
    "fusion": 0.012,
    "importClean": 0.05,
    "hydrogenImport": 0.05,
    "gasCcs": 0.17,
    "solarRooftop": 0.041,
    "csp": 0.027,
    "hydrogenPower": 0.05,
    "hydrogenGreen": 0.03,
    "hydrogenBlue": 0.2,
    "wte": 0.3,
}

FINAL_EMISSION_FACTOR = {"importFossil": 0.27, "gasDirect": 0.2, "importClean": 0.05, "hydrogenImport": 0.03}


def primary_efficiency(key: str) -> float:
    """נצילות ההמרה של מקור (1 למקור לא מוכר)."""
    return PRIMARY_EFFICIENCY.get(key, 1)


def source_mtoe(key: str, twh: float) -> float:
    """אנרגיה ראשונית (Mtoe) של מקור שמייצר twh חשמל."""
    return (twh / primary_efficiency(key)) * TOE_PER_TWH


def source_bcm(key: str, twh: float) -> float:
    """צריכת הגז (BCM) של מקור שמייצר twh חשמל; 0 למקור שאינו גז."""
    return twh / primary_efficiency(key) / TWH_TH_PER_BCM if key in GAS_SOURCES else 0.0


def source_mt_co2(key: str, twh: float) -> float:
    """פליטות (מיליון טון CO₂eq) של מקור שמייצר twh חשמל."""
    return twh * EMISSION_FACTOR.get(key, 0)


def fuel_ratios(points: list[dict], years: list[int]) -> list[dict]:
    """יחסי ההמרה של תמהיל ההיצע בכל שנה (0 בשנה בלי היצע)."""
    sums: dict[int, dict] = {}
    for p in points:
        t = sums.setdefault(p["year"], {"twh": 0.0, "mtoe": 0.0, "bcm": 0.0, "co2": 0.0})
        t["twh"] += p["twh"]
        t["mtoe"] += source_mtoe(p["source"], p["twh"])
        t["bcm"] += source_bcm(p["source"], p["twh"])
        t["co2"] += source_mt_co2(p["source"], p["twh"])
    out = []
    for year in years:
        t = sums.get(year, {"twh": 0.0, "mtoe": 0.0, "bcm": 0.0, "co2": 0.0})
        if t["twh"] > 0:
            out.append(
                {
                    "year": year,
                    "mtoePerTWh": t["mtoe"] / t["twh"],
                    "bcmPerTWh": t["bcm"] / t["twh"],
                    "co2PerTWh": t["co2"] / t["twh"],
                }
            )
        else:
            out.append({"year": year, "mtoePerTWh": 0.0, "bcmPerTWh": 0.0, "co2PerTWh": 0.0})
    return out


def fuel_mtoe(twh: float) -> float:
    """אנרגיה ראשונית (Mtoe) של דלק בשימוש ישיר."""
    return twh * TOE_PER_TWH


def fuel_bcm(key: str, twh: float) -> float:
    """צריכת הגז (BCM) של דלק בשימוש ישיר: רק gasDirect."""
    return twh / TWH_TH_PER_BCM if key == "gasDirect" else 0.0


def fuel_mt_co2(key: str, twh: float) -> float:
    """פליטות (מיליון טון CO₂eq) של דלק בשימוש ישיר."""
    return twh * FINAL_EMISSION_FACTOR.get(key, 0)
