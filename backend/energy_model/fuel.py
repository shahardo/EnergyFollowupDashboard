"""מקדמי ההמרה של מקורות האספקה: אנרגיה ראשונית, גז ופליטות (פורט של src/model/fuel.ts), ב-SI.

המקורות בתרחישים נושאים efficiency / emissionFactor / inputFuel בעצמם; הטבלאות כאן הן רק ברירות מחדל
לקבצים ישנים או למפתח לא מוכר.
"""

from __future__ import annotations

from collections.abc import Callable

from .units import J_PER_M3_GAS, J_PER_TWH, KG_PER_MT


def _per_twh(mt_per_twh: float) -> float:
    """Mt/TWh → kg/J."""
    return (mt_per_twh * KG_PER_MT) / J_PER_TWH


DEFAULT_EFFICIENCY = {
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
}
DEFAULT_EMISSION = {
    k: _per_twh(v)
    for k, v in {
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
    }.items()
}
GAS_FUELS = ("NaturalGas", "LNG")
DEFAULT_GAS_SOURCES = ("gas", "lng")
FINAL_EMISSION_FACTOR = {
    "importFossil": _per_twh(0.27),
    "gasDirect": _per_twh(0.2),
    "importClean": _per_twh(0.05),
    "hydrogenImport": _per_twh(0.03),
}


def factor_of(s: dict | str) -> dict:
    """המקדמים של מקור: {efficiency, emissionFactor (kg/J), burnsGas}, מהמקור או מברירות המחדל."""
    src = {"key": s} if isinstance(s, str) else s
    key = src["key"]
    eff = src.get("efficiency")
    em = src.get("emissionFactor")
    fuel = src.get("inputFuel")
    return {
        "efficiency": eff if eff is not None else DEFAULT_EFFICIENCY.get(key, 1),
        "emissionFactor": em if em is not None else DEFAULT_EMISSION.get(key, 0),
        "burnsGas": fuel in GAS_FUELS if fuel is not None else key in DEFAULT_GAS_SOURCES,
    }


def factors_of(sources: list[dict]) -> Callable[[str], dict]:
    """פונקציה מהמפתח למקדמים, לפי המקורות של תרחיש."""
    table = {s["key"]: factor_of(s) for s in sources}
    return lambda key: table.get(key) or factor_of(key)


def source_primary_energy(f: dict, energy: float) -> float:
    """אנרגיה ראשונית (J) של מקור שמייצר energy (J) חשמל."""
    return energy / f["efficiency"]


def source_gas_volume(f: dict, energy: float) -> float:
    """צריכת הגז (m³) של מקור; 0 למקור שאינו גז."""
    return energy / f["efficiency"] / J_PER_M3_GAS if f["burnsGas"] else 0.0


def source_co2(f: dict, energy: float) -> float:
    """פליטות (kg CO₂eq) של מקור שמייצר energy (J) חשמל."""
    return energy * f["emissionFactor"]


def fuel_ratios(points: list[dict], years: list[int], factor: Callable[[str], dict] = factor_of) -> list[dict]:
    """יחסי ההמרה של תמהיל ההיצע בכל שנה (0 בשנה בלי היצע)."""
    sums: dict[int, dict] = {}
    for p in points:
        t = sums.setdefault(p["year"], {"energy": 0.0, "primary": 0.0, "gas": 0.0, "co2": 0.0})
        f = factor(p["source"])
        t["energy"] += p["energy"]
        t["primary"] += source_primary_energy(f, p["energy"])
        t["gas"] += source_gas_volume(f, p["energy"])
        t["co2"] += source_co2(f, p["energy"])
    out = []
    for year in years:
        t = sums.get(year, {"energy": 0.0, "primary": 0.0, "gas": 0.0, "co2": 0.0})
        if t["energy"] > 0:
            e = t["energy"]
            out.append(
                {"year": year, "primaryPerJ": t["primary"] / e, "gasVolumePerJ": t["gas"] / e, "co2PerJ": t["co2"] / e}
            )
        else:
            out.append({"year": year, "primaryPerJ": 0.0, "gasVolumePerJ": 0.0, "co2PerJ": 0.0})
    return out


def fuel_gas_volume(key: str, energy: float) -> float:
    """צריכת הגז (m³) של דלק בשימוש ישיר: רק gasDirect."""
    return energy / J_PER_M3_GAS if key == "gasDirect" else 0.0


def fuel_co2(key: str, energy: float) -> float:
    """פליטות (kg CO₂eq) של דלק בשימוש ישיר."""
    return energy * FINAL_EMISSION_FACTOR.get(key, 0)
