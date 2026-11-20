"""השלמה והתאמה אוטומטית של ההיצע (פורט של src/model/autofill.ts)."""

from __future__ import annotations

from collections.abc import Callable

from .core import INF, SECONDS_PER_YEAR, round_up_power
from .supply import compute_gap, compute_supply, interpolate_capacity, set_capacity_at, source_capacity, source_energy
from .units import J_PER_TWH, W_PER_GW

#: המרווח (בשנים) בין שנות העוגן של ההשלמה.
AUTOFILL_STEP_YEARS = 5
#: capacity credit מינימלי של מקור "יציב" לכיסוי השיא.
FIRM_CREDIT_MIN = 0.5
#: ספים זניחים: 1e-9 TWh (J) ו-1e-9 GW (W), ושינוי שלא מדווח: 0.005 GW.
ENERGY_EPS = 1e-9 * J_PER_TWH
POWER_EPS = 1e-9 * W_PER_GW
REPORT_EPS = 0.005 * W_PER_GW


def auto_fill_years(years: list[int]) -> list[int]:
    """שנות העוגן: כל 5 שנים משנת הבסיס, ושנת האופק."""
    if not years:
        return []
    first, last = years[0], years[-1]
    out = [y for y in years if (y - first) % AUTOFILL_STEP_YEARS == 0]
    if out[-1] != last:
        out.append(last)
    return out


def _is_retired(s: dict, year: int) -> bool:
    return s.get("retireYear") is not None and year >= s["retireYear"]


def _max_gw(s: dict) -> float | None:
    return s.get("maxPower")


def fill_greedy(priority: list[dict], energy_gap: float, peak_gap: float, grow: Callable[[dict, float], float]) -> None:
    """הצעד החמדני: קודם פער האנרגיה לפי הסדר (CF > 0), אחר כך פער השיא, קודם ממקורות יציבים."""
    for s in priority:
        if energy_gap <= ENERGY_EPS:
            break
        if s["capacityFactor"] <= 0:
            continue
        gw = grow(s, energy_gap / (s["capacityFactor"] * SECONDS_PER_YEAR))
        energy_gap -= source_energy(gw, s["capacityFactor"])
        peak_gap -= gw * s["capacityCredit"]
    firm = [s for s in priority if s["capacityCredit"] >= FIRM_CREDIT_MIN]
    weak = [s for s in priority if 0 < s["capacityCredit"] < FIRM_CREDIT_MIN]
    for s in [*firm, *weak]:
        if peak_gap <= POWER_EPS:
            break
        peak_gap -= grow(s, peak_gap / s["capacityCredit"]) * s["capacityCredit"]


def auto_fill(demand: list[dict], scenario: dict, start_year: dict[str, int] | None = None) -> dict:
    """מילוי חמדני של הפער לפי fillPriority, בשנות העוגן; מחזיר {scenario, addedGW}."""
    start_year = start_year or {}

    def start_of(s: dict) -> float:
        return start_year.get(s["key"], -INF)

    years = [d["year"] for d in demand]
    anchors = auto_fill_years(years)
    by_key = {s["key"]: s for s in scenario["sources"]}
    priority = [by_key[k] for k in scenario["fillPriority"] if k in by_key]
    added: dict[str, float] = {s["key"]: 0.0 for s in priority}
    added_at: dict[str, list[dict]] = {s["key"]: [] for s in priority}
    by_year = {d["year"]: d for d in demand}

    for y in anchors:
        d = by_year.get(y)
        if not d:
            continue
        for s in priority:
            if _max_gw(s) is None:
                continue
            room = max(0.0, s["maxPower"] - source_capacity(s, y))
            if added.get(s["key"], 0.0) > room:
                added[s["key"]] = room

        def cap(s: dict, y: int = y) -> float:
            return 0.0 if _is_retired(s, y) else source_capacity(s, y) + added.get(s["key"], 0.0)

        energy_gap = d["energy"] - sum_js(source_energy(cap(s), s["capacityFactor"]) for s in scenario["sources"])
        peak_gap = d["peak"] - sum_js(cap(s) * s["capacityCredit"] for s in scenario["sources"])

        def grow(s: dict, wanted: float, y: int = y, cap=cap) -> float:
            if _is_retired(s, y) or y < start_of(s):
                return 0.0
            room = INF if _max_gw(s) is None else max(0.0, s["maxPower"] - cap(s))
            gw = min(wanted, room)
            if gw <= 0:
                return 0.0
            added[s["key"]] = added.get(s["key"], 0.0) + gw
            return gw

        fill_greedy(priority, energy_gap, peak_gap, grow)
        for s in priority:
            added_at[s["key"]].append({"year": y, "power": added.get(s["key"], 0.0)})

    for s in priority:
        pts = added_at[s["key"]]
        zero_year = start_of(s) - 1
        if zero_year > (anchors[0] if anchors else INF) and not any(p["year"] == zero_year for p in pts):
            pts.append({"year": int(zero_year), "power": 0})
            pts.sort(key=lambda p: p["year"])

    added_gw: dict[str, float] = {}
    sources = []
    for s in scenario["sources"]:
        points = added_at.get(s["key"])
        total = added.get(s["key"], 0.0)
        if points is None or total <= POWER_EPS:
            sources.append(s)
            continue
        added_gw[s["key"]] = total
        if not s["enabled"]:
            sources.append(
                {
                    **s,
                    "enabled": True,
                    "capacity": [{"year": p["year"], "power": round_up_power(p["power"])} for p in points],
                }
            )
            continue
        all_years = sorted({*(p["year"] for p in s["capacity"]), *(p["year"] for p in points)})
        sources.append(
            {
                **s,
                "capacity": [
                    {
                        "year": yr,
                        "power": round_up_power(
                            interpolate_capacity(s["capacity"], yr) + interpolate_capacity(points, yr)
                        ),
                    }
                    for yr in all_years
                ],
            }
        )
    return {"scenario": {**scenario, "sources": sources}, "added": added_gw}


def sum_js(values) -> float:
    """סכום משמאל לימין, כמו reduce של JavaScript (לא fsum), כדי שהתוצאה תהיה זהה עד הביט."""
    total = 0.0
    for v in values:
        total += v
    return total


def auto_adjust(demand: list[dict], scenario: dict) -> dict:
    """השלמה, ואז הקטנה יחסית של כל המקורות בשנות עוגן שבהן ההיצע עולה על הביקוש."""
    filled = auto_fill(demand, scenario)
    years = [d["year"] for d in demand]
    by_year = {d["year"]: d for d in demand}
    anchors = auto_fill_years(years)
    factors = []
    for year in anchors:
        d = by_year[year]
        twh = 0.0
        firm = 0.0
        for s in filled["scenario"]["sources"]:
            gw = source_capacity(s, year)
            twh += source_energy(gw, s["capacityFactor"])
            firm += gw * s["capacityCredit"]
        if twh <= d["energy"] + ENERGY_EPS:
            factors.append({"year": year, "k": 1})
            continue
        k = max(d["energy"] / twh, d["peak"] / firm if firm > 0 else 1)
        factors.append({"year": year, "k": 1 if k > 0.999 else k})

    removed: dict[str, float] = {}
    if all(f["k"] == 1 for f in factors):
        return {**filled, "removed": removed, "factors": factors}

    k_points = [{"year": f["year"], "power": f["k"]} for f in factors]
    last = years[-1]
    sources = []
    for s in filled["scenario"]["sources"]:
        if not s["enabled"]:
            sources.append(s)
            continue
        all_years = sorted({*(p["year"] for p in s["capacity"]), *anchors})
        cap = [
            {
                "year": yr,
                "power": round_up_power(interpolate_capacity(s["capacity"], yr) * interpolate_capacity(k_points, yr)),
            }
            for yr in all_years
        ]
        r = source_capacity(s, last) - source_capacity({**s, "capacity": cap}, last)
        if r > REPORT_EPS:
            removed[s["key"]] = r
        sources.append({**s, "capacity": cap})

    added = dict(filled["added"])
    for k, r in list(removed.items()):
        if k not in added:
            continue
        net = added[k] - r
        del added[k]
        del removed[k]
        if net > REPORT_EPS:
            added[k] = net
        elif net < -REPORT_EPS:
            removed[k] = -net
    return {
        "scenario": {**filled["scenario"], "sources": sources},
        "added": added,
        "removed": removed,
        "factors": factors,
    }


def top_up_every_year(totals: list[dict], s: dict, start_year: dict[str, int] | None = None) -> dict:
    """משלים כל שנה שנשאר בה פער (אחרי ההשלמה בשנות העוגן), באותו צעד חמדני, ממקורות פעילים."""
    start_year = start_year or {}
    cur = s
    first = totals[0]["year"] if totals else INF
    for t in totals:
        g = compute_gap([t], compute_supply(cur, [t["year"]]), cur)[0]
        by_key = {x["key"]: x for x in cur["sources"]}
        priority = [by_key[k] for k in cur["fillPriority"] if k in by_key and by_key[k]["enabled"]]

        def grow(src: dict, wanted: float, t: dict = t, by_key: dict = by_key) -> float:
            nonlocal cur
            start = start_year.get(src["key"], -INF)
            if t["year"] < start:
                return 0.0
            now = by_key[src["key"]]
            gw = source_capacity(now, t["year"])
            limit = src.get("maxPower")
            add = min(wanted, max(0.0, (INF if limit is None else limit) - gw))
            if add <= POWER_EPS:
                return 0.0
            points = now["capacity"]
            if start - 1 > first and start - 1 < t["year"] and not any(p["year"] == start - 1 for p in points):
                points = set_capacity_at(points, int(start - 1), interpolate_capacity(points, start - 1))
            nxt = {**now, "capacity": set_capacity_at(points, t["year"], round_up_power(gw + add))}
            by_key[src["key"]] = nxt
            cur = {**cur, "sources": [nxt if x["key"] == src["key"] else x for x in cur["sources"]]}
            return add

        fill_greedy(priority, g["gapEnergy"], g["peakGap"], grow)
    return cur
