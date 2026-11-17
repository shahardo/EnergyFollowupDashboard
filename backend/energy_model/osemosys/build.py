"""בונה מודל tz-osemosys מתרחיש של הדשבורד: המודל של osemosys_israel, התוספות שלנו, והביקוש וההיצע של התרחיש.

שלבים:
1. טוענים את המודל (data/israel_energy_model.yaml) וממזגים עליו את additions.yaml לפי id.
2. ביקוש: כל מגזר ותת-מגזר של הדשבורד שולח את הביקוש נטו שלו לסחורה שלו (PJ = TWh × 3.6). בשנים שלפני
   שנת הבסיס של הדשבורד, ערך שנת הבסיס; אחרי האופק, ערך האופק. demand_source="model" משאיר את הביקוש של
   המודל (רק לסחורות שהוספנו, שאין להן ביקוש במודל, נכנס הביקוש של הדשבורד).
3. היצע, לפי run_mode:
   - כל המצבים: הצי הקיים (residual_capacity) הוא ההספק של הדשבורד בשנת הבסיס, קבוע עד retireYear. מקור כבוי
     בדשבורד: התחנות שלו לא נבנות (capacity_gross_max = 0). יבוא דלקים (טכנולוגיות בלי הספק) תמיד זמין,
     כי הדשבורד מכבה רק את השימוש בהם לייצור חשמל.
   - "free": המודל בוחר את התמהיל הזול ביותר.
   - "capped": גם maxGW של הדשבורד, על כל תחנה בקבוצה של המקור.
   - "follow": עקומות ההספק של הדשבורד הן מינימום (על התחנה הראשית של כל מקור), והמודל מוסיף רק את החסר.
4. earliest_year בתוספות: לפניו אין בנייה חדשה (או יבוא).
"""

from __future__ import annotations

import copy
import math
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml

from ..demand import project_sub_sectors
from ..plan import project_non_electric
from ..supply import compute_demand_series, source_capacity
from .mapping import (
    PJ_PER_TWH,
    REGION,
    is_capacity_tech,
    model_capacity_per_gw,
    sector_commodities,
    source_technologies,
)

HERE = Path(__file__).parent
RunMode = Literal["free", "capped", "follow"]
DemandSource = Literal["dashboard", "model"]

#: תקרה "בלי גבול" למקומות שצריכים מספר (שנים שאחרי earliest_year).
UNBOUNDED = 1e9


@lru_cache
def _load(name: str) -> dict:
    return yaml.safe_load((HERE / name).read_text(encoding="utf-8"))


def base_model() -> dict:
    """המודל של osemosys_israel כמו שהוא (עותק)."""
    return copy.deepcopy(_load("data/israel_energy_model.yaml"))


def merged_model() -> dict:
    """המודל עם התוספות שלנו (בלי earliest_year), לפני התרחיש."""
    model = base_model()
    add = copy.deepcopy(_load("additions.yaml"))
    for section in ("commodities", "technologies", "impacts"):
        items = model.setdefault(section, [])
        index = {x["id"]: i for i, x in enumerate(items)}
        for item in add.get(section) or []:
            if item["id"] in index:
                items[index[item["id"]]] = item
            else:
                items.append(item)
    return model


def model_years(model: dict) -> list[int]:
    """שנות המודל."""
    td = model["time_definition"]
    return [int(y) for y in td.get("years") or range(td["start_year"], td["end_year"] + 1)]


def _yearly(values: dict[int, float], years: list[int]) -> dict[str, float]:
    """ערך לכל שנת מודל: לפני הראשונה של הדשבורד הערך הראשון, אחרי האחרונה הערך האחרון."""
    known = sorted(values)
    out = {}
    for y in years:
        v = values[known[0]] if y < known[0] else values[known[-1]] if y > known[-1] else values[y]
        out[str(y)] = float(v)
    return out


def _measure_factor(demand: dict, year: int) -> float:
    """(1 − e)(1 − s) של התרחיש בשנה: אותו מקדם לחשמל ולדלקים (applyMeasures)."""
    m = demand.get("measures") or {"efficiencyPct": 0, "savingPct": 0}
    b, h = demand["baseYear"], demand["horizonYear"]
    r = 0.0 if year <= b else 1.0 if year >= h else (year - b) / (h - b)
    return (1 - m["efficiencyPct"] / 100 * r) * (1 - m["savingPct"] / 100 * r)


def dashboard_demand_pj(demand: dict) -> dict[str, dict[int, float]]:
    """{סחורה: {שנה: PJ}} מהדשבורד: חשמל של כל מגזר; במגזרי החום והתחבורה גם הדלקים והגז (אנרגיה סופית)."""
    ds = compute_demand_series(demand)
    commodities = sector_commodities()
    ne = {
        (p["sector"], p["year"]): p["fuelsTWh"] + p["gasTWh"] for p in project_non_electric(demand, ds["demandPoints"])
    }
    heat = {s["key"] for s in demand["sectors"] if s["key"].startswith(("heatCool", "industrialHeat"))}
    out: dict[str, dict[int, float]] = {}

    def add(commodity: str, year: int, twh: float) -> None:
        out.setdefault(commodity, {})
        out[commodity][year] = out[commodity].get(year, 0.0) + twh * _measure_factor(demand, year) * PJ_PER_TWH

    with_subs = {s["key"]: s for s in demand["sectors"] if s.get("subSectors")}
    for p in ds["demandPoints"]:
        if p["sector"] in with_subs:
            continue  # נשלח דרך תתי-המגזרים
        c = commodities.get(p["sector"])
        if not c:
            continue  # מגזר שלא מוכר לקטלוג (נוסף בקובץ): אין לו סחורה במודל
        extra = ne.get((p["sector"], p["year"]), 0.0) if p["sector"] in heat else 0.0
        add(c, p["year"], p["twh"] + extra)
    for p in project_sub_sectors(demand):
        c = commodities.get(p["subSector"])
        if not c:
            continue
        sub = next(x for x in with_subs[p["sector"]]["subSectors"] if x["key"] == p["subSector"])
        add(c, p["year"], p["twh"] + ne.get((p["sector"], p["year"]), 0.0) * sub["fuelShare"])
    return out


def _set_demand(model: dict, demand: dict, source: DemandSource) -> None:
    years = model_years(model)
    values = dashboard_demand_pj(demand)
    for c in model["commodities"]:
        if c["id"] not in values:
            continue
        if source == "model" and c.get("demand_annual"):
            continue
        c["demand_annual"] = {REGION: _yearly(values[c["id"]], years)}


def _tech_index(model: dict) -> dict[str, dict]:
    return {t["id"]: t for t in model["technologies"]}


def _set_supply(model: dict, supply: dict, mode: RunMode) -> None:
    years = model_years(model)
    techs = _tech_index(model)
    groups = source_technologies()
    for src in supply["sources"]:
        group = [techs[t] for t in groups.get(src["key"], []) if t in techs]
        plants = [t for t in group if is_capacity_tech(t)]
        if not plants:
            continue
        # הצי הקיים: ההספק בשנת הבסיס של הדשבורד, קבוע עד שנת ההוצאה משימוש; מתחלק כמו במודל, או לראשונה.
        base_year = min(p["year"] for p in src["capacityGW"]) if src["capacityGW"] else years[0]
        base_gw = source_capacity({**src, "retireYear": None}, base_year) if src["enabled"] else 0.0
        shares = [float(next(iter((t.get("residual_capacity") or {}).values()), 0) or 0) for t in plants]
        shares = shares if sum(shares) > 0 else [1.0] + [0.0] * (len(plants) - 1)
        retire = src.get("retireYear")
        for t, share in zip(plants, shares):
            f = model_capacity_per_gw(t)
            gw = base_gw * share / sum(shares)
            t["residual_capacity"] = {str(y): gw * f if (retire is None or y < retire) else 0.0 for y in years}
            if not src["enabled"]:
                t["capacity_gross_max"] = {str(y): 0.0 for y in years}
            elif mode == "capped" and src.get("maxGW") is not None:
                t["capacity_gross_max"] = {str(y): src["maxGW"] * f for y in years}
        if src["enabled"] and mode == "follow":
            main = plants[0]
            f = model_capacity_per_gw(main)
            curve = {y: source_capacity(src, y) for y in range(base_year, max(years) + 1)}
            main["capacity_gross_min"] = {k: v * f for k, v in _yearly(curve, years).items()}
            if "capacity_gross_max" in main:  # follow + cap: the cap must not be below the curve
                main["capacity_gross_max"] = {
                    y: max(v, main["capacity_gross_min"][y]) for y, v in main["capacity_gross_max"].items()
                }


def _apply_earliest_years(model: dict) -> None:
    years = model_years(model)
    for t in model["technologies"]:
        start = t.pop("earliest_year", None)
        if start is None:
            continue
        if is_capacity_tech(t):
            t["capacity_additional_max"] = {str(y): 0.0 if y < start else UNBOUNDED for y in years}
        else:
            t["activity_annual_max"] = {str(y): 0.0 if y < start else UNBOUNDED for y in years}


def build_model_dict(
    demand: dict | None, supply: dict | None, run_mode: RunMode = "free", demand_source: DemandSource = "dashboard"
) -> dict:
    """המודל (dict בפורמט tz-osemosys) לתרחיש. demand / supply = None: בלי שינוי בצד הזה."""
    model = merged_model()
    if demand is not None:
        _set_demand(model, demand, demand_source)
    if supply is not None:
        _set_supply(model, supply, run_mode)
    _apply_earliest_years(model)
    _drop_empty_demands(model)
    return model


def _drop_empty_demands(model: dict) -> None:
    """סחורת ביקוש שהוספנו ולא קיבלה ביקוש (תרחיש בלי המגזר) נשארת בלי demand_annual, ולא אפסים חסרי ערך."""
    for c in model["commodities"]:
        d = c.get("demand_annual")
        if d and all(not math.isfinite(v) for v in d.get(REGION, {}).values()):
            del c["demand_annual"]


def build_model(
    demand: dict | None, supply: dict | None, run_mode: RunMode = "free", demand_source: DemandSource = "dashboard"
):
    """מודל tz-osemosys מוכן לפתרון."""
    from tz.osemosys import Model

    return Model(**build_model_dict(demand, supply, run_mode, demand_source))
