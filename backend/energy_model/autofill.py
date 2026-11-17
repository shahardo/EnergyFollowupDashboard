"""השלמה והתאמה אוטומטית של ההיצע (פורט של src/model/autofill.ts)."""

from __future__ import annotations

from collections.abc import Callable

from .core import HOURS_PER_YEAR_K, INF, round_up2
from .supply import compute_gap, compute_supply, energy_twh, interpolate_capacity, set_capacity_at, source_capacity

#: המרווח (בשנים) בין שנות העוגן של ההשלמה.
AUTOFILL_STEP_YEARS = 5
#: capacity credit מינימלי של מקור "יציב" לכיסוי השיא.
FIRM_CREDIT_MIN = 0.5


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
    return s.get("maxGW")


def fill_greedy(priority: list[dict], energy_gap: float, peak_gap: float, grow: Callable[[dict, float], float]) -> None:
    """הצעד החמדני: קודם פער האנרגיה לפי הסדר (CF > 0), אחר כך פער השיא, קודם ממקורות יציבים."""
    for s in priority:
        if energy_gap <= 1e-9:
            break
        if s["capacityFactor"] <= 0:
            continue
        gw = grow(s, energy_gap / (s["capacityFactor"] * HOURS_PER_YEAR_K))
        energy_gap -= energy_twh(gw, s["capacityFactor"])
        peak_gap -= gw * s["capacityCredit"]
    firm = [s for s in priority if s["capacityCredit"] >= FIRM_CREDIT_MIN]
    weak = [s for s in priority if 0 < s["capacityCredit"] < FIRM_CREDIT_MIN]
    for s in [*firm, *weak]:
        if peak_gap <= 1e-9:
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
            room = max(0.0, s["maxGW"] - source_capacity(s, y))
            if added.get(s["key"], 0.0) > room:
                added[s["key"]] = room

        def cap(s: dict, y: int = y) -> float:
            return 0.0 if _is_retired(s, y) else source_capacity(s, y) + added.get(s["key"], 0.0)

        energy_gap = d["twh"] - sum_js(energy_twh(cap(s), s["capacityFactor"]) for s in scenario["sources"])
        peak_gap = d["peakGW"] - sum_js(cap(s) * s["capacityCredit"] for s in scenario["sources"])

        def grow(s: dict, wanted: float, y: int = y, cap=cap) -> float:
            if _is_retired(s, y) or y < start_of(s):
                return 0.0
            room = INF if _max_gw(s) is None else max(0.0, s["maxGW"] - cap(s))
            gw = min(wanted, room)
            if gw <= 0:
                return 0.0
            added[s["key"]] = added.get(s["key"], 0.0) + gw
            return gw

        fill_greedy(priority, energy_gap, peak_gap, grow)
        for s in priority:
            added_at[s["key"]].append({"year": y, "gw": added.get(s["key"], 0.0)})

    for s in priority:
        pts = added_at[s["key"]]
        zero_year = start_of(s) - 1
        if zero_year > (anchors[0] if anchors else INF) and not any(p["year"] == zero_year for p in pts):
            pts.append({"year": int(zero_year), "gw": 0})
            pts.sort(key=lambda p: p["year"])

    added_gw: dict[str, float] = {}
    sources = []
    for s in scenario["sources"]:
        points = added_at.get(s["key"])
        total = added.get(s["key"], 0.0)
        if points is None or total <= 1e-9:
            sources.append(s)
            continue
        added_gw[s["key"]] = total
        if not s["enabled"]:
            sources.append(
                {**s, "enabled": True, "capacityGW": [{"year": p["year"], "gw": round_up2(p["gw"])} for p in points]}
            )
            continue
        all_years = sorted({*(p["year"] for p in s["capacityGW"]), *(p["year"] for p in points)})
        sources.append(
            {
                **s,
                "capacityGW": [
                    {
                        "year": yr,
                        "gw": round_up2(interpolate_capacity(s["capacityGW"], yr) + interpolate_capacity(points, yr)),
                    }
                    for yr in all_years
                ],
            }
        )
    return {"scenario": {**scenario, "sources": sources}, "addedGW": added_gw}


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
            twh += energy_twh(gw, s["capacityFactor"])
            firm += gw * s["capacityCredit"]
        if twh <= d["twh"] + 1e-9:
            factors.append({"year": year, "k": 1})
            continue
        k = max(d["twh"] / twh, d["peakGW"] / firm if firm > 0 else 1)
        factors.append({"year": year, "k": 1 if k > 0.999 else k})

    removed: dict[str, float] = {}
    if all(f["k"] == 1 for f in factors):
        return {**filled, "removedGW": removed, "factors": factors}

    k_points = [{"year": f["year"], "gw": f["k"]} for f in factors]
    last = years[-1]
    sources = []
    for s in filled["scenario"]["sources"]:
        if not s["enabled"]:
            sources.append(s)
            continue
        all_years = sorted({*(p["year"] for p in s["capacityGW"]), *anchors})
        cap = [
            {
                "year": yr,
                "gw": round_up2(interpolate_capacity(s["capacityGW"], yr) * interpolate_capacity(k_points, yr)),
            }
            for yr in all_years
        ]
        r = source_capacity(s, last) - source_capacity({**s, "capacityGW": cap}, last)
        if r > 0.005:
            removed[s["key"]] = r
        sources.append({**s, "capacityGW": cap})

    added = dict(filled["addedGW"])
    for k, r in list(removed.items()):
        if k not in added:
            continue
        net = added[k] - r
        del added[k]
        del removed[k]
        if net > 0.005:
            added[k] = net
        elif net < -0.005:
            removed[k] = -net
    return {
        "scenario": {**filled["scenario"], "sources": sources},
        "addedGW": added,
        "removedGW": removed,
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
            limit = src.get("maxGW")
            add = min(wanted, max(0.0, (INF if limit is None else limit) - gw))
            if add <= 1e-9:
                return 0.0
            points = now["capacityGW"]
            if start - 1 > first and start - 1 < t["year"] and not any(p["year"] == start - 1 for p in points):
                points = set_capacity_at(points, int(start - 1), interpolate_capacity(points, start - 1))
            nxt = {**now, "capacityGW": set_capacity_at(points, t["year"], round_up2(gw + add))}
            by_key[src["key"]] = nxt
            cur = {**cur, "sources": [nxt if x["key"] == src["key"] else x for x in cur["sources"]]}
            return add

        fill_greedy(priority, g["gapTWh"], g["peakGapGW"], grow)
    return cur
