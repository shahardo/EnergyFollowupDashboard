"""פרמטרי המודל של הרצה: מה שהפותר קיבל (הביקוש, העלויות, אורך החיים, הגבולות...), בטבלאות קריאות.

הכול נלקח מהמודל שנבנה (build_model_dict), ביחידות המודל: PJ, GW, M$ (M$/GW = $/kW, M$/PJ = $/GJ), Mt/PJ.
"""

from __future__ import annotations

from typing import Any

from .build import CARRIER_TAG, UNBOUNDED, RunMode, build_model_dict, energy_system, sector_commodities

#: הקבוצה של טכנולוגיה לפי הקידומת של המזהה שלה.
GROUPS = {"PWR_": "supply", "H2_": "supply", "STO_": "supply", "USE_": "endUse", "IMP_": "import", "BLD_": "blend"}


def _values(x: Any) -> list[float]:
    """הערכים של פרמטר (מספר, {שנה: ערך} או {אזור: {שנה: ערך}})."""
    if isinstance(x, int | float):
        return [float(x)]
    if isinstance(x, dict):
        return [v for item in x.values() for v in _values(item)]
    return []


def _span(x: Any) -> dict[str, float] | None:
    """{min, max} של פרמטר שנתי, בלי השנים שבהן הוא "ללא גבול" (None אם אין גבול באף שנה).

    גבול שהוא רק "0 לפני שנה מסוימת" (יבוא שמתחיל מאוחר) הוא None כאן: השנה מופיעה בטבלת הדלקים / בשנת הבנייה.
    """
    v = _values(x)
    bounded = [a for a in v if a < UNBOUNDED]
    if not bounded or (len(bounded) < len(v) and not any(bounded)):
        return None
    return {"min": min(bounded), "max": max(bounded)}


def _first_build(x: dict | None, years: list[int]) -> int | None:
    """השנה הראשונה שבה מותרת בנייה חדשה (None: אין מגבלה)."""
    if not x:
        return None
    open_years = [int(y) for y, v in x.items() if v > 0]
    return min(open_years) if open_years else None


def parameters(demand: dict, supply: dict, run_mode: RunMode = "free") -> dict[str, Any]:
    """הפרמטרים של המודל לתרחיש: system, demand, technologies, fuels."""
    m = build_model_dict(demand, supply, run_mode)
    es = energy_system()
    years = m["time_definition"]["years"]
    split = m["time_definition"]["year_split"]
    region = m["regions"][0]["id"]

    # שמות: מגזרים ותתי-מגזרים מתרחיש הביקוש, מקורות מתרחיש ההיצע
    sector_label = {}
    for s in demand["sectors"]:
        sector_label[s["key"]] = s.get("label") or s["key"]
        for sub in s.get("subSectors") or []:
            sector_label[sub["key"]] = sub.get("label") or sub["key"]
    commodity_sector = {v["commodity"]: k for k, v in sector_commodities().items()}
    source_label = {s["key"]: s.get("label") or s["key"] for s in supply["sources"]}
    carrier_of = {tag: carrier for carrier, tag in CARRIER_TAG.items()}

    demand_rows = []
    for c in m["commodities"]:
        if "demand_annual" not in c:
            continue
        key = commodity_sector.get(c["id"])
        annual = c["demand_annual"][region]
        demand_rows.append(
            {
                "commodity": c["id"],
                "sector": key,
                "label": sector_label.get(key, c["id"]),
                "values": [float(annual.get(str(y), 0.0)) for y in years],
            }
        )

    techs = []
    for t in m["technologies"]:
        tid = t["id"]
        group = next((g for p, g in GROUPS.items() if tid.startswith(p)), "other")
        mode = t["operating_modes"][0]
        row: dict[str, Any] = {"id": tid, "group": group}
        if group == "supply":
            key = tid.split("_", 1)[1]
            row.update(source=key, label=source_label.get(key, key))
        elif group == "endUse":
            commodity, tag = tid[4:].rsplit("_", 1)
            key = commodity_sector.get(commodity)
            row.update(sector=key, carrier=carrier_of.get(tag), label=sector_label.get(key, commodity))
        else:
            row["label"] = tid.split("_", 1)[1]
        cf = t.get("capacity_factor")
        if isinstance(cf, dict):  # לפי פרק זמן: הממוצע המשוקלל על השנה
            cf = sum(v * split[ts] for ts, v in cf.items())
        residual = t.get("residual_capacity")
        emission = (mode.get("emission_activity_ratio") or {}).get("CO2")
        row.update(
            inputs=mode.get("input_activity_ratio") or {},
            outputs=sorted(mode.get("output_activity_ratio") or {}),
            capex=t.get("capex"),
            opexFixed=t.get("opex_fixed"),
            opexVariable=mode.get("opex_variable"),
            operatingLife=t.get("operating_life"),
            capacityFactor=cf,
            reserveCredit=t.get("include_in_joint_reserve_margin"),
            residualCapacity=float(residual.get(str(years[0]), 0.0)) if residual else None,
            capacityMax=_span(t.get("capacity_gross_max")),
            capacityMin=_span(t.get("capacity_gross_min")),
            activityMin=_span(t.get("activity_annual_min")),
            activityMax=_span(t.get("activity_annual_max")),
            firstBuildYear=_first_build(t.get("capacity_additional_max"), years),
            emission=emission,
        )
        techs.append(row)

    fuels = [
        {
            "commodity": f["commodity"],
            "source": f["source"],
            "label": source_label.get(f["source"], f["source"]),
            "price": f["price"] * 1e9,  # $/J → $/GJ (= M$/PJ)
            "earliestYear": f.get("earliestYear"),
        }
        for f in es["fuelImports"]
    ]
    impact = next((i for i in m["impacts"] if i["id"] == "CO2"), {})
    return {
        "units": {"energy": "PJ", "power": "GW", "capex": "$/kW", "variable": "$/GJ", "emission": "Mt/PJ"},
        "system": {
            "modelId": m["id"],
            "runMode": run_mode,
            "region": region,
            "years": years,
            "timeslices": split,
            "discountRate": m["discount_rate"],
            "reserveMargin": m["reserve_margin"],
            "emissionPenalty": impact.get("penalty", 0.0),  # M$/Mt = $/t
            "technologies": len(m["technologies"]),
            "commodities": len(m["commodities"]),
        },
        "demand": demand_rows,
        "technologies": techs,
        "fuels": fuels,
    }
