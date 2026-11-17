"""המרה מפורמט v1 (TWh / GW / MW / אחוזים) ל-v2 (SI), כמו src/io/migrateV1.ts, לקבצים שנשלחים לשרת.

מקור בלי הנתונים הכלכליים (כל קובץ v1) מקבל אותם מהתרחיש המוכן באותו מפתח, כמו upgradeSupply בדשבורד.
"""

from __future__ import annotations

from .data import supply_preset
from .units import from_gw, from_pct, from_twh

ECONOMIC_FIELDS = (
    "capitalCost",
    "fixedCost",
    "variableCost",
    "operatingLife",
    "efficiency",
    "inputFuel",
    "emissionFactor",
    "earliestYear",
    "profile",
)


def _clean(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def migrate_demand_v1(d: dict) -> dict:
    """תרחיש ביקוש v1 → v2."""
    m = d.get("measures")
    return _clean(
        {
            "id": d["id"],
            "name": d["name"],
            "preset": d.get("preset"),
            "baseYear": d["baseYear"],
            "horizonYear": d["horizonYear"],
            "measures": m and {"efficiency": from_pct(m["efficiencyPct"]), "saving": from_pct(m["savingPct"])},
            "sectors": [
                _clean(
                    {
                        "key": s["key"],
                        "label": s["label"],
                        "baseEnergy": from_twh(s["baseTWh"]),
                        "growthRate": from_pct(s["growthPct"]),
                        "curve": s["curve"],
                        "sMidYear": s.get("sMidYear"),
                        "efficiencyRate": from_pct(s["efficiencyPct"]),
                        "loadFactor": s["loadFactor"],
                        "nonElectric": (ne := s.get("nonElectric"))
                        and _clean(
                            {
                                "fuels": from_twh(ne["fuelsTWh"]),
                                "gas": from_twh(ne["gasTWh"]),
                                "growthRate": from_pct(ne["growthPct"]),
                                "electrifyOffset": ne.get("electrifyOffset"),
                            }
                        ),
                        "subSectors": [
                            _clean(
                                {
                                    "key": x["key"],
                                    "label": x["label"],
                                    "elecShare": x["elecShare"],
                                    "fuelShare": x["fuelShare"],
                                    "growthRate": None if x.get("growthPct") is None else from_pct(x["growthPct"]),
                                }
                            )
                            for x in s["subSectors"]
                        ]
                        if s.get("subSectors")
                        else None,
                    }
                )
                for s in d["sectors"]
            ],
        }
    )


def migrate_plan_params_v1(p: dict) -> dict:
    """כללי התכנון v1 → v2."""
    return {
        "solar": {"base": from_gw(p["solar"]["baseGW"]), "slope": from_gw(p["solar"]["slopeGW"])},
        "solar30": {"start": p["solar30"]["start"], "slope": from_gw(p["solar30"]["slopeGW"])},
        "solar40": {"start": p["solar40"]["start"], "slope": from_gw(p["solar40"]["slopeGW"])},
        "importElectricity": {
            "start": p["importElectricity"]["start"],
            "step": from_gw(p["importElectricity"]["stepGW"]),
            "stepYears": p["importElectricity"]["stepYears"],
            "steps": p["importElectricity"]["steps"],
        },
        "geothermal": {**_ramp(p["geothermal"])},
        "fusion": {**_ramp(p["fusion"])},
        "cleanFuels": {"start": p["cleanFuels"]["start"], "share": from_pct(p["cleanFuels"]["sharePct"])},
        "hydrogen": {"start": p["hydrogen"]["start"], "share": from_pct(p["hydrogen"]["sharePct"])},
    }


def _ramp(r: dict) -> dict:
    return {"start": r["start"], "rate": from_gw(r["rateGW"]), "rampYears": r["rampYears"]}


def migrate_supply_v1(s: dict) -> dict:
    """תרחיש היצע v1 → v2, עם הנתונים הכלכליים מהתרחיש המוכן."""
    preset = supply_preset(s.get("demandPreset") or "medium", s.get("preset") or "declared")
    base = {x["key"]: x for x in preset["sources"]}
    sources = []
    for x in s["sources"]:
        src = _clean(
            {
                "key": x["key"],
                "label": x["label"],
                "enabled": x["enabled"],
                "renewable": x["renewable"],
                "capacity": [{"year": c["year"], "power": from_gw(c["gw"])} for c in x["capacityGW"]],
                "capacityFactor": x["capacityFactor"],
                "capacityCredit": x["capacityCredit"],
                "retireYear": x.get("retireYear"),
                "maxPower": None if x.get("maxGW") is None else from_gw(x["maxGW"]),
            }
        )
        b = base.get(x["key"], {})
        src.update({f: b[f] for f in ECONOMIC_FIELDS if f in b})
        sources.append(src)
    return _clean(
        {
            "id": s["id"],
            "name": s["name"],
            "preset": s.get("preset"),
            "demandPreset": s.get("demandPreset"),
            "demandScenarioRef": s.get("demandScenarioRef"),
            "sources": sources,
            "fillPriority": s["fillPriority"],
            "planParams": s.get("planParams") and migrate_plan_params_v1(s["planParams"]),
        }
    )


def migrate_projects_v1(p: dict) -> dict:
    """רשימת משימות v1 → v2."""
    out = []
    for t in p["projects"]:
        x = {k: v for k, v in t.items() if k not in ("mw", "progressPct")}
        if t.get("mw") is not None:
            x["power"] = t["mw"] * 1e6
        x["progress"] = from_pct(t["progressPct"])
        out.append(x)
    return {**p, "projects": out}


MIGRATE = {"demand": migrate_demand_v1, "supply": migrate_supply_v1, "projects": migrate_projects_v1}


def migrate_file(envelope: dict) -> dict:
    """מעטפת של קובץ: v1 מומרת ל-v2; v2 חוזרת כמו שהיא."""
    if envelope.get("schema") != "energy-dashboard/v1":
        return envelope
    kind = envelope.get("kind")
    if kind not in MIGRATE:
        return envelope
    return {**envelope, "schema": "energy-dashboard/v2", "data": MIGRATE[kind](envelope["data"])}
