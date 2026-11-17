"""ביקוש שאינו חשמל, תמהיל הדלקים וכללי תכנון התרחישים (פורט של src/model/carriers.ts ו-scenarioPlan.ts)."""

from __future__ import annotations

import math
from collections.abc import Callable

from .core import HOURS_PER_YEAR_K, INF, linear_share, round2, round_up2, year_range
from .demand import apply_measures
from .supply import compute_supply, interpolate_capacity

#: מקורות הדלק, מלמטה למעלה בערימה.
FUEL_KEYS = ("importClean", "hydrogenImport", "importFossil")
#: מקורות החשמל שהכללים קובעים, מלמטה למעלה.
PLAN_RULE_KEYS = ("solar", "solar30", "solar40", "importElectricity", "geothermal", "fusion")
GAS_KEY = "gas"
GAS_DIRECT_KEY = "gasDirect"


def is_rule_key(key: str) -> bool:
    """האם קבוצת פרמטרים היא כלל של מקור חשמל."""
    return key in PLAN_RULE_KEYS


# ── ביקוש שאינו חשמל ─────────────────────────────────────────────────────


def project_non_electric(demand: dict, demand_points: list[dict]) -> list[dict]:
    """{year, sector, fuelsTWh, gasTWh}: בסיס בצמיחה שנתית, פחות הדלק שהחשמול מחליף (לא מתחת לאפס)."""
    elec = {f"{p['sector']}|{p['year']}": p["twh"] for p in demand_points}
    out = []
    b, h = demand["baseYear"], demand["horizonYear"]
    for s in demand["sectors"]:
        ne = s.get("nonElectric")
        if not ne:
            continue
        e0 = elec.get(f"{s['key']}|{b}", 0.0)
        for year in range(b, h + 1):
            grow = math.pow(1 + ne["growthPct"] / 100, year - b)
            displaced = (ne.get("electrifyOffset") or 0) * max(0.0, elec.get(f"{s['key']}|{year}", 0.0) - e0)
            out.append(
                {
                    "year": year,
                    "sector": s["key"],
                    "fuelsTWh": max(0.0, ne["fuelsTWh"] * grow - displaced),
                    "gasTWh": ne["gasTWh"] * grow,
                }
            )
    return out


def has_non_electric(s: dict) -> bool:
    """האם למגזר יש ביקוש שאינו חשמל."""
    ne = s.get("nonElectric")
    return bool(ne) and (ne["fuelsTWh"] > 0 or ne["gasTWh"] > 0)


def measure_non_electric(
    demand: dict, points: list[dict], years: list[int], include: Callable[[str], bool] = lambda _k: True
) -> dict:
    """{fuels, gas}: הביקוש שאינו חשמל של המגזרים שעוברים את include, אחרי ההפחתות."""
    fuels: dict[int, float] = {}
    gas: dict[int, float] = {}
    for p in points:
        if not include(p["sector"]):
            continue
        fuels[p["year"]] = fuels.get(p["year"], 0.0) + p["fuelsTWh"]
        gas[p["year"]] = gas.get(p["year"], 0.0) + p["gasTWh"]

    def measure(m: dict[int, float]) -> list[dict]:
        return apply_measures(
            [{"year": y, "twh": m.get(y, 0.0), "peakGW": 0.0} for y in years],
            demand.get("measures"),
            demand["baseYear"],
            demand["horizonYear"],
        )

    return {"fuels": measure(fuels), "gas": measure(gas)}


def fuel_shares(year: int, params: dict, horizon_year: int) -> dict:
    """תמהיל הדלקים בשנה: נקיים ומימן עולים לינארית עד sharePct באופק; הפוסיליים משלימים."""

    def part(p: dict) -> float:
        return 0.0 if year < p["start"] else (p["sharePct"] / 100) * linear_share(year, p["start"], horizon_year)

    clean = part(params["cleanFuels"])
    hydrogen = part(params["hydrogen"])
    total = clean + hydrogen
    if total > 1:
        clean /= total
        hydrogen /= total
    return {"importClean": clean, "hydrogenImport": hydrogen, "importFossil": max(0.0, 1 - clean - hydrogen)}


def fuel_supply_points(fuels: list[dict], params: dict, horizon_year: int) -> list[dict]:
    """מקורות הדלק לפי תמהיל השנה, בצורת נקודות היצע (gw ו-firmGW תמיד 0)."""
    out = []
    for f in fuels:
        shares = fuel_shares(f["year"], params, horizon_year)
        for source in FUEL_KEYS:
            out.append(
                {"year": f["year"], "source": source, "gw": 0.0, "twh": f["twh"] * shares[source], "firmGW": 0.0}
            )
    return out


# ── כללי התכנון ──────────────────────────────────────────────────────────


def _smooth(x: float) -> float:
    return 0.0 if x <= 0 else 1.0 if x >= 1 else x * x * (3 - 2 * x)


def ramp_capacity(p: dict, year: int) -> float:
    """הספק של מקור "קשת": קצב שעולה בקשת חלקה לאורך rampYears ואז rateGW בשנה."""
    gw = 0.0
    for y in range(int(p["start"]), int(year) + 1):
        gw += p["rateGW"] * (_smooth((y - p["start"] + 1) / p["rampYears"]) if p["rampYears"] > 0 else 1)
    return gw


def plan_capacity(key: str, p: dict, year: int, base_year: int) -> float:
    """הספק (GW) של מקור חשמל בשנה לפי הכלל שלו."""
    if key == "solar":
        return p["solar"]["baseGW"] + p["solar"]["slopeGW"] * max(0, year - base_year)
    if key in ("solar30", "solar40"):
        return p[key]["slopeGW"] * max(0, year - p[key]["start"] + 1)
    if key == "importElectricity":
        q = p["importElectricity"]
        anchors = [{"year": q["start"] - 1, "gw": 0}]
        for k in range(int(q["steps"])):
            anchors.append({"year": q["start"] + k * q["stepYears"], "gw": q["stepGW"] * (k + 1)})
        return interpolate_capacity(anchors, year)
    if key in ("geothermal", "fusion"):
        return ramp_capacity(p[key], year)
    raise KeyError(key)


def plan_curve(key: str, p: dict, base_year: int, horizon_year: int) -> list[dict]:
    """עקומת הכלל: נקודה לכל שנה, מעוגלת ל-0.01 GW."""
    return [{"year": y, "gw": round2(plan_capacity(key, p, y, base_year))} for y in year_range(base_year, horizon_year)]


def _with_curve(s: dict, key: str, capacity: list[dict]) -> dict:
    return {
        **s,
        "sources": [{**x, "capacityGW": capacity, "enabled": True} if x["key"] == key else x for x in s["sources"]],
    }


def _cap_of(s: dict, key: str) -> float:
    src = next((x for x in s["sources"] if x["key"] == key), None)
    cap = src.get("maxGW") if src else None
    return INF if cap is None else cap


def _rule_curve(s: dict, key: str, base: int, horizon: int) -> list[dict]:
    cap = _cap_of(s, key)
    return [{"year": c["year"], "gw": min(c["gw"], cap)} for c in plan_curve(key, s["planParams"], base, horizon)]


def refill_gas(scenario: dict, totals: list[dict]) -> dict:
    """הגז משלים את מה ששאר המקורות משאירים: max(TWh חסר / (CF·8.76), שיא חסר / credit), כלפי מעלה."""
    gas = next((s for s in scenario["sources"] if s["key"] == GAS_KEY), None)
    if not gas or not totals:
        return scenario
    years = [t["year"] for t in totals]
    others = compute_supply({**scenario, "sources": [s for s in scenario["sources"] if s["key"] != GAS_KEY]}, years)
    by_year: dict[int, dict] = {}
    for p in others:
        v = by_year.setdefault(p["year"], {"twh": 0.0, "firm": 0.0})
        v["twh"] += p["twh"]
        v["firm"] += p["firmGW"]
    curve = []
    for t in totals:
        o = by_year.get(t["year"], {"twh": 0.0, "firm": 0.0})
        gw = max(
            max(0.0, t["twh"] - o["twh"]) / (max(gas["capacityFactor"], 1e-6) * HOURS_PER_YEAR_K),
            max(0.0, t["peakGW"] - o["firm"]) / max(gas["capacityCredit"], 1e-6),
        )
        curve.append({"year": t["year"], "gw": round_up2(gw)})
    return _with_curve(scenario, GAS_KEY, curve)


def apply_plan_rule(scenario: dict, key: str, totals: list[dict]) -> dict:
    """מחיל כלל של מקור אחד (עד ה-maxGW שלו) וממלא מחדש בגז."""
    if not scenario.get("planParams") or not totals:
        return scenario
    base, horizon = totals[0]["year"], totals[-1]["year"]
    return refill_gas(_with_curve(scenario, key, _rule_curve(scenario, key, base, horizon)), totals)


def apply_plan_rules(scenario: dict, totals: list[dict]) -> dict:
    """מחיל את כל הכללים ואז ממלא בגז (בניית התרחישים המוכנים)."""
    if not scenario.get("planParams") or not totals:
        return scenario
    base, horizon = totals[0]["year"], totals[-1]["year"]
    s = scenario
    for key in PLAN_RULE_KEYS:
        s = _with_curve(s, key, _rule_curve(scenario, key, base, horizon))
    return refill_gas(s, totals)


def rule_matches(scenario: dict, key: str, base_year: int, horizon_year: int) -> bool:
    """האם העקומה של מקור עדיין שווה לכלל שלו (עד 0.01 GW)."""
    src = next((s for s in scenario["sources"] if s["key"] == key), None)
    if not src or not scenario.get("planParams"):
        return True
    if not src["enabled"]:
        return False
    cap = _cap_of(scenario, key)
    return all(
        abs(
            interpolate_capacity(src["capacityGW"], y)
            - min(cap, plan_capacity(key, scenario["planParams"], y, base_year))
        )
        <= 0.011
        for y in year_range(base_year, horizon_year)
    )


def plan_supply(
    scenario: dict, params: dict, years: list[int], electric: list[dict], fuels: list[dict], horizon_year: int
) -> dict:
    """אספקת טאב תכנון התרחישים: מקורות הכללים, שאר המקורות, הגז אחרון; כל אחד עד הביקוש שנשאר."""
    enabled = [s for s in scenario["sources"] if s["enabled"]]

    def rank(k: str) -> int:
        return PLAN_RULE_KEYS.index(k) if is_rule_key(k) else 1000 if k == GAS_KEY else 100

    # מיון לפי (דרגה, מיקום מקורי): אותו סדר כמו ב-TypeScript.
    keys = [s for _r, _i, s in sorted((rank(s["key"]), i, s["key"]) for i, s in enumerate(enabled))]
    raw = {f"{p['source']}|{p['year']}": p for p in compute_supply(scenario, years)}
    elec_by_year = {t["year"]: t for t in electric}
    fuel_by_year = {f["year"]: f for f in fuels}
    out = {"electricKeys": keys, "electric": [], "fuels": []}
    for year in years:
        d = elec_by_year.get(year, {"twh": 0.0, "peakGW": 0.0})
        twh_left = d["twh"]
        peak_left = d["peakGW"]
        for key in keys:
            p = raw.get(f"{key}|{year}", {"year": year, "source": key, "gw": 0.0, "twh": 0.0, "firmGW": 0.0})
            twh = min(p["twh"], max(0.0, twh_left))
            firm = min(p["firmGW"], max(0.0, peak_left))
            twh_left -= twh
            peak_left -= firm
            out["electric"].append({"year": year, "source": key, "gw": p["gw"], "twh": twh, "firmGW": firm})
        f = fuel_by_year.get(year, {"fuelsTWh": 0.0, "gasTWh": 0.0})
        out["fuels"].extend(fuel_supply_points([{"year": year, "twh": f["fuelsTWh"]}], params, horizon_year))
        out["fuels"].append({"year": year, "source": GAS_DIRECT_KEY, "gw": 0.0, "twh": f["gasTWh"], "firmGW": 0.0})
    return out
