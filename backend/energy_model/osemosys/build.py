"""בונה מודל tz-osemosys מהנתונים של הדשבורד בלבד: תרחיש ביקוש, תרחיש היצע ו-energySystem.json.

אין מודל חיצוני ואין שכבת תוספות: כל סחורה וטכנולוגיה נגזרת מהקבצים של src/data.
- ביקוש: כל מגזר או תת-מגזר (catalog.json) הוא סחורת ביקוש, באנרגיה שימושית: החשמל, הדלקים והגז נטו של המגזר
  (אחרי ההתייעלות והחיסכון), כל אחד כפול היעילות של טכנולוגיית השימוש שלו (energySystem.endUse לפי kind).
  ב-kind "fixed" כל נשא מוחזק בערך של הדשבורד; באחרים המודל בוחר את התמהיל, מהצי של שנת הבסיס.
- היצע: כל מקור של התרחיש הוא טכנולוגיה אחת עם הנתונים הכלכליים שלו (capitalCost, fixedCost, variableCost,
  operatingLife, efficiency + inputFuel, emissionFactor, earliestYear, profile). הצי הקיים (residual) = ההספק בשנת
  הבסיס, קבוע עד retireYear. מקור כבוי לא נבנה. run_mode: free = הזול ביותר; capped = גם maxPower; follow = עקומת
  ההספק של הדשבורד היא מינימום.
- דלקים: יבוא (fuelImports) במחיר ל-J; הנשא Fuels של טכנולוגיות השימוש מגיע מתערובת (fuelBlends) עם פליטות
  הבעירה שלה.
- המערכת: שיעור היוון, מרווח עתודה (ההספק הזמין: הספק × capacityCredit), קנס פליטות.

יחידות: הקבצים ב-SI; המודל מקבל PJ (פעילות), GW (הספק) ומיליוני $ (עלות), כדי שהבעיה תהיה מאוזנת מספרית.
ההמרה נעשית כאן ובפתרון (solve.py) בלבד.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from ..core import linear_share
from ..data import catalog, read_json
from ..demand import project_sub_sectors
from ..plan import project_non_electric
from ..supply import compute_demand_series, source_capacity
from ..units import SECONDS_PER_YEAR

RunMode = Literal["free", "capped", "follow"]

#: J ב-PJ.
J_PER_PJ = 1e15
#: W ב-GW.
W_PER_GW = 1e9
#: $ במיליון $.
USD_PER_MUSD = 1e6
#: kg במיליון טון.
KG_PER_MT = 1e9
#: PJ ש-GW אחד מייצר בשנה מלאה (capacity_activity_unit_ratio של כל הטכנולוגיות).
PJ_PER_GW_YEAR = SECONDS_PER_YEAR * W_PER_GW / J_PER_PJ
#: עלות הון/קבועה: $/W → מיליון $ ל-GW.
CAPEX_FACTOR = W_PER_GW / USD_PER_MUSD
#: עלות משתנה: $/J → מיליון $ ל-PJ.
VAR_FACTOR = J_PER_PJ / USD_PER_MUSD
#: מקדם פליטה: kg/J → מיליון טון ל-PJ.
EMISSION_FACTOR = J_PER_PJ / KG_PER_MT
#: תקרה "בלי גבול" (GW או PJ) לשנים שאחרי earliestYear.
UNBOUNDED = 1e6
#: הנשאים של טכנולוגיות השימוש, והסחורה שכל אחד צורך.
CARRIERS = {"electricity": "Electricity", "fuels": "Fuels", "gas": "NaturalGas"}
CARRIER_TAG = {"electricity": "ELEC", "fuels": "FUEL", "gas": "GAS"}


@lru_cache
def energy_system() -> dict:
    """energySystem.json."""
    return read_json("energySystem.json")


def _clean(d: dict) -> dict:
    """בלי מפתחות הערה ($comment...)."""
    return {k: v for k, v in d.items() if not k.startswith("$")}


def model_years(demand: dict) -> list[int]:
    """שנות המודל: משנת הבסיס עד האופק של תרחיש הביקוש."""
    return list(range(demand["baseYear"], demand["horizonYear"] + 1))


def _year_split() -> dict[str, float]:
    return _clean(energy_system()["timeslices"])


def _shape(profile: dict | None) -> dict[str, float]:
    """צורה על פני פרקי הזמן, בממוצע משוקלל 1 (בלי צורה: 1 בכולם)."""
    split = _year_split()
    if not profile:
        return dict.fromkeys(split, 1.0)
    p = _clean(profile)
    mean = sum(p[ts] * f for ts, f in split.items())
    return {ts: p[ts] / mean for ts in split}


def _measure_factor(demand: dict, year: int) -> float:
    """(1 − e)(1 − s) של התרחיש בשנה: אותו מקדם לחשמל ולדלקים (applyMeasures)."""
    m = demand.get("measures") or {"efficiency": 0, "saving": 0}
    r = linear_share(year, demand["baseYear"], demand["horizonYear"])
    return (1 - m["efficiency"] * r) * (1 - m["saving"] * r)


def sector_commodities() -> dict[str, dict]:
    """{מפתח מגזר או תת-מגזר: {commodity, kind}}."""
    out = {}
    for s in catalog()["sectors"]:
        if s.get("commodity"):
            out[s["key"]] = {"commodity": s["commodity"], "kind": s["kind"]}
        for sub in s.get("subSectors") or []:
            out[sub["key"]] = {"commodity": sub["commodity"], "kind": s["kind"]}
    return out


def final_energy(demand: dict) -> dict[str, dict]:
    """{סחורה: {kind, electricity|fuels|gas: {שנה: J}}}: האנרגיה הסופית נטו של כל מגזר לפי נשא."""
    ds = compute_demand_series(demand)
    sectors = sector_commodities()
    ne = {(p["sector"], p["year"]): p for p in project_non_electric(demand, ds["demandPoints"])}
    out: dict[str, dict] = {}

    def add(key: str, year: int, carrier: str, energy: float) -> None:
        info = sectors.get(key)
        if not info:
            return  # מגזר שלא מוכר לקטלוג (נוסף בקובץ): אין לו סחורה במודל
        c = out.setdefault(info["commodity"], {"kind": info["kind"], **{k: {} for k in CARRIERS}})
        c[carrier][year] = c[carrier].get(year, 0.0) + energy * _measure_factor(demand, year)

    subs = {s["key"]: s for s in demand["sectors"] if s.get("subSectors")}
    for p in ds["demandPoints"]:
        n = ne.get((p["sector"], p["year"]))
        if p["sector"] in subs:
            for sub in subs[p["sector"]]["subSectors"]:
                if n:
                    add(sub["key"], p["year"], "fuels", n["fuels"] * sub["fuelShare"])
                    add(sub["key"], p["year"], "gas", n["gas"] * sub["fuelShare"])
            continue
        add(p["sector"], p["year"], "electricity", p["energy"])
        if n:
            add(p["sector"], p["year"], "fuels", n["fuels"])
            add(p["sector"], p["year"], "gas", n["gas"])
    for p in project_sub_sectors(demand):
        add(p["subSector"], p["year"], "electricity", p["energy"])
    return out


def _yearly(values: dict[int, float], years: list[int], scale: float = 1.0) -> dict[str, float]:
    """ערך לכל שנת מודל (0 לשנה בלי ערך)."""
    return {str(y): float(values.get(y, 0.0)) * scale for y in years}


def _flat(value: float, years: list[int]) -> dict[str, float]:
    return {str(y): float(value) for y in years}


def _from_year(start: int | None, years: list[int]) -> dict[str, float] | None:
    """0 לפני start, ובלי גבול ממנו."""
    if start is None or start <= years[0]:
        return None
    return {str(y): 0.0 if y < start else UNBOUNDED for y in years}


def _no_build_before(start: int | None, years: list[int]) -> dict[str, float]:
    """capacity_additional_max: שנת הבסיס היא הצי הקיים (אין בה בנייה חדשה), ואין בנייה לפני start."""
    first = max(years[0] + 1, start or 0)
    return {str(y): 0.0 if y < first else UNBOUNDED for y in years}


def _mode(inputs: dict, outputs: dict, cost: float = 0.0, co2: float = 0.0) -> dict:
    m: dict = {"id": "STANDARD"}
    if cost:
        m["opex_variable"] = cost
    if inputs:
        m["input_activity_ratio"] = inputs
    if outputs:
        m["output_activity_ratio"] = outputs
    if co2:
        m["emission_activity_ratio"] = {"CO2": co2}
    return m


def _economics(x: dict) -> dict:
    """עלות הון, עלות קבועה ואורך חיים ביחידות המודל."""
    out: dict = {}
    if x.get("capitalCost"):
        out["capex"] = x["capitalCost"] * CAPEX_FACTOR
    if x.get("fixedCost"):
        out["opex_fixed"] = x["fixedCost"] * CAPEX_FACTOR
    if x.get("operatingLife"):
        out["operating_life"] = int(x["operatingLife"])
    return out


def _end_use(final: dict[str, dict], years: list[int]) -> tuple[list[dict], dict[str, dict]]:
    """טכנולוגיות השימוש לכל סחורת ביקוש, והביקוש השימושי (PJ) של כל סחורה."""
    es = energy_system()
    gas_ef = es["gasEmissionFactor"]
    base = years[0]
    techs, demands = [], {}
    for commodity, c in final.items():
        kind = es["endUse"][c["kind"]]
        useful = dict.fromkeys(years, 0.0)
        for carrier in CARRIERS:
            values = c[carrier]
            if not any(values.get(y, 0) > 0 for y in years):
                continue
            spec = _clean(kind[carrier])
            eff = spec["efficiency"]
            for y in years:
                useful[y] += values.get(y, 0.0) * eff
            co2 = gas_ef / eff * EMISSION_FACTOR if carrier == "gas" else 0.0
            t = {
                "id": f"USE_{commodity}_{CARRIER_TAG[carrier]}",
                "capacity_activity_unit_ratio": PJ_PER_GW_YEAR,
                "operating_modes": [_mode({CARRIERS[carrier]: 1 / eff}, {commodity: 1.0}, co2=co2)],
            }
            if not kind["switching"]:
                # בלי מעבר בין נשאים: הנשא מספק בדיוק את החלק שלו בדשבורד
                t["activity_annual_min"] = {str(y): values.get(y, 0.0) * eff / J_PER_PJ for y in years}
            else:
                t.update(_economics(spec))
                # הצי נמדד לפי השימוש השנתי הממוצע (capacityFactor), אבל בכל פרק זמן הוא יכול לפעול במלואו
                cf = spec.get("capacityFactor", 1.0)
                life = spec.get("operatingLife") or 1
                fleet = values.get(base, 0.0) * eff / (cf * SECONDS_PER_YEAR) / W_PER_GW
                t["residual_capacity"] = {str(y): fleet * max(0.0, 1 - (y - base) / life) for y in years}
                t["capacity_additional_max"] = _no_build_before(None, years)
            techs.append(t)
        demands[commodity] = {"kind": c["kind"], "useful": useful}
    return techs, demands


def _fuels(years: list[int]) -> list[dict]:
    """יבוא דלקים ותערובת הנשא Fuels."""
    es = energy_system()
    techs = []
    for f in es["fuelImports"]:
        t = {
            "id": f"IMP_{f['commodity']}",
            "capacity_activity_unit_ratio": PJ_PER_GW_YEAR,
            "operating_modes": [_mode({}, {f["commodity"]: 1.0}, cost=f["price"] * VAR_FACTOR)],
        }
        limit = _from_year(f.get("earliestYear"), years)
        if limit:
            t["activity_annual_max"] = limit
        techs.append(t)
    for commodity, b in _clean(es["fuelBlends"]).items():
        techs.append(
            {
                "id": f"BLD_{commodity}",
                "capacity_activity_unit_ratio": PJ_PER_GW_YEAR,
                "operating_modes": [_mode({commodity: 1.0}, {"Fuels": 1.0}, co2=b["emissionFactor"] * EMISSION_FACTOR)],
            }
        )
    return techs


def _source_tech(src: dict, cat: dict, mode: RunMode, years: list[int]) -> dict:
    """טכנולוגיה למקור של תרחיש ההיצע."""
    es = energy_system()
    output = cat.get("output", "Electricity")
    eff = src.get("efficiency") or 1.0
    fuel = src.get("inputFuel")
    inputs = {fuel: 1 / eff} if fuel and output != "none" else {}
    outputs = {output: 1.0} if output != "none" else {}
    var = (src.get("variableCost") or 0.0) * VAR_FACTOR
    co2 = (src.get("emissionFactor") or 0.0) * EMISSION_FACTOR
    t: dict = {
        "id": cat["technology"],
        "capacity_activity_unit_ratio": PJ_PER_GW_YEAR,
        **_economics(src),
        "operating_modes": [_mode(inputs, outputs, cost=var, co2=co2 if outputs else 0.0)],
        "include_in_joint_reserve_margin": float(src["capacityCredit"]),
    }
    if outputs:
        profile = src.get("profile")
        if profile:
            shape = _shape(es["capacityProfiles"][profile])
            t["capacity_factor"] = {ts: min(1.0, src["capacityFactor"] * v) for ts, v in shape.items()}
        else:
            t["capacity_factor"] = max(es["dispatchableAvailability"], src["capacityFactor"])
    # הצי הקיים: ההספק בשנת הבסיס, קבוע עד שנת ההוצאה משימוש
    base = years[0]
    fleet = source_capacity({**src, "retireYear": None}, base) / W_PER_GW if src["enabled"] else 0.0
    retire = src.get("retireYear")
    t["residual_capacity"] = {str(y): fleet if (retire is None or y < retire) else 0.0 for y in years}
    if not src["enabled"]:
        t["capacity_gross_max"] = _flat(0.0, years)
        return t
    if mode == "capped" and src.get("maxPower") is not None:
        t["capacity_gross_max"] = _flat(src["maxPower"] / W_PER_GW, years)
    if mode == "follow":
        t["capacity_gross_min"] = {str(y): source_capacity(src, y) / W_PER_GW for y in years}
        if "capacity_gross_max" in t:  # follow + תקרה: התקרה לא מתחת לעקומה
            t["capacity_gross_max"] = {
                y: max(v, t["capacity_gross_min"][y]) for y, v in t["capacity_gross_max"].items()
            }
    start = src.get("earliestYear")
    if mode == "follow" and start is not None:
        # follow: עקומת הדשבורד יכולה להקדים את earliestYear; אז הבנייה מותרת משנת העלייה הראשונה שלה
        rise = next((int(y) for y, v in t["capacity_gross_min"].items() if v > fleet + 1e-9), None)
        start = start if rise is None else min(start, rise)
    t["capacity_additional_max"] = _no_build_before(start, years)
    return t


def build_model_dict(demand: dict, supply: dict, run_mode: RunMode = "free") -> dict:
    """המודל (dict בפורמט tz-osemosys, בפריסה של osemosys_israel) לתרחיש."""
    es = energy_system()
    region = es["region"]
    years = model_years(demand)
    split = _year_split()
    cat = {s["key"]: s for s in catalog()["sources"]}

    use_techs, demands = _end_use(final_energy(demand), years)
    techs = [_source_tech(s, cat[s["key"]], run_mode, years) for s in supply["sources"] if s["key"] in cat]
    techs += _fuels(years) + use_techs

    used = {c for t in techs for m in t["operating_modes"] for c in m.get("input_activity_ratio", {})}
    made = {c for t in techs for m in t["operating_modes"] for c in m.get("output_activity_ratio", {})}
    commodities = []
    for c in sorted(used | made, key=lambda x: (x in demands, x)):
        item: dict = {"id": c}
        if c in demands:
            d = demands[c]
            item["demand_annual"] = {region: _yearly(d["useful"], years, 1 / J_PER_PJ)}
            shape = _shape(es["demandProfiles"].get(d["kind"]))
            total = sum(shape[ts] * f for ts, f in split.items())
            item["demand_profile"] = {ts: shape[ts] * f / total for ts, f in split.items()}
        if c == "Electricity":
            item["include_in_joint_reserve_margin"] = True
        commodities.append(item)

    penalty = es.get("emissionPenalty") or 0.0
    return {
        "id": f"israel_{demand.get('preset') or 'custom'}_{supply.get('preset') or 'custom'}_{run_mode}",
        "time_definition": {
            "id": "israel_time_definition",
            "years": years,
            "timeslices": list(split),
            "year_split": split,
        },
        "regions": [{"id": region}],
        "discount_rate": es["discountRate"],
        "reserve_margin": es["reserveMargin"],
        "commodities": commodities,
        "impacts": [{"id": "CO2", **({"penalty": penalty * KG_PER_MT / USD_PER_MUSD} if penalty else {})}],
        "technologies": techs,
    }


def build_model(demand: dict, supply: dict, run_mode: RunMode = "free"):
    """מודל tz-osemosys מוכן לפתרון."""
    from tz.osemosys import Model

    return Model(**build_model_dict(demand, supply, run_mode))
