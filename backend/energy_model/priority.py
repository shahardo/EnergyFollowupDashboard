"""תעדוף ערוצים ועקומת האספקה האידאלית (פורט של src/model/priority.ts).

בגרסת ה-TypeScript הציונים מגיעים כפונקציה (scoreOf); כאן הם טבלה: {מפתח מקור: ציון}. מקור שחסר בטבלה
מקבל את הציון של "other", כמו scoreFor בדשבורד.
"""

from __future__ import annotations

from .autofill import auto_fill, top_up_every_year
from .core import js_round
from .fuel import factor_of, source_co2
from .supply import compute_supply, source_capacity
from .units import J_PER_TWH, W_PER_GW

PRIORITY_AXES = ("sustainability", "affordability", "security", "feasibility")
TRILEMMA_AXES = ("security", "affordability", "sustainability")
FEASIBILITY_WEIGHT_FULL = 0.5
SHORTFALL_ENERGY_EPS = 0.05 * J_PER_TWH
SHORTFALL_POWER_EPS = 0.05 * W_PER_GW


def score_of(scores: dict[str, dict], key: str) -> dict:
    """הציון של ערוץ; ערוץ לא מוכר מקבל את של "other"."""
    return scores.get(key) or scores["other"]


def normalize_weights(w: dict) -> dict:
    """משקלות מנורמלים לסכום 1; סכום 0 נותן משקלות שווים."""
    clean = [max(0.0, w.get(a, 0) if isinstance(w.get(a, 0), (int, float)) else 0) for a in PRIORITY_AXES]
    total = 0.0
    for v in clean:
        total += v
    return {a: (clean[i] / total if total > 0 else 1 / len(PRIORITY_AXES)) for i, a in enumerate(PRIORITY_AXES)}


def merit_score(score: dict, w: dict) -> float:
    """Σ משקל × ציון (0..10); היישימות (0..100) מומרת ל-0..10."""
    n = normalize_weights(w)
    total = n["feasibility"] * (score["feasibility"] * 10)
    for a in TRILEMMA_AXES:
        total += n[a] * score[a]
    return total


def effective_start_year(rng: dict, feasibility_weight: float) -> int:
    """שנת ההתחלה בפועל: מהמוקדמת (משקל 0) לריאלית (משקל ≥ 0.5), לינארית, מעוגלת."""
    f = min(1.0, max(0.0, feasibility_weight) / FEASIBILITY_WEIGHT_FULL)
    late = max(rng["earliest"], rng["realistic"])
    return int(js_round(rng["earliest"] + (late - rng["earliest"]) * f))


def start_years_for(ranges: dict[str, dict], w: dict) -> dict[str, int]:
    """שנת ההתחלה בפועל של כל ערוץ שיש לו טווח."""
    f = normalize_weights(w)["feasibility"]
    return {k: effective_start_year(r, f) for k, r in ranges.items()}


def rank_sources(sources: list[dict], scores: dict, opts: dict, base_year: int) -> list[dict]:
    """דירוג לפי הציון (יציב בשוויון): {key, merit, eligible, retiring}."""
    rows = []
    for i, s in enumerate(sources):
        sc = score_of(scores, s["key"])
        merit = merit_score(sc, opts["weights"])
        rows.append(
            {
                "i": i,
                "key": s["key"],
                "merit": merit,
                "eligible": sc["feasibility"] >= opts["minFeasibility"],
                "retiring": merit < opts["retireBelow"] and source_capacity(s, base_year) > 0,
            }
        )
    rows.sort(key=lambda r: (-r["merit"], r["i"]))
    return [{k: r[k] for k in ("key", "merit", "eligible", "retiring")} for r in rows]


def existing_fleet(scenario: dict, base_year: int, retire: set[str], retire_by: int, max_gw: dict) -> dict:
    """הצי הקיים: ההספק בשנת הבסיס (יורד לאפס עד retire_by למושבתים); התקרות של הכלי."""
    sources = []
    for s in scenario["sources"]:
        gw0 = source_capacity(s, base_year)
        if s["key"] in retire and gw0 > 0:
            cap = (
                [{"year": base_year, "power": gw0}, {"year": retire_by, "power": 0}]
                if retire_by > base_year
                else [{"year": base_year, "power": 0}]
            )
        else:
            cap = [{"year": base_year, "power": gw0}]
        nxt = {**s, "enabled": gw0 > 0, "capacity": cap}
        c = max_gw.get(s["key"])
        if c is None:
            nxt.pop("maxPower", None)
        else:
            nxt["maxPower"] = c
        sources.append(nxt)
    return {**scenario, "sources": sources}


def ideal_supply(demand: list[dict], scenario: dict, scores: dict, opts: dict) -> dict:
    """העקומה האידאלית: הצי הקיים, השבתה מוקדמת, השלמה לפי הדירוג והשלמה שנתית."""
    years = [d["year"] for d in demand]
    base_year = years[0]
    ranking = rank_sources(scenario["sources"], scores, opts, base_year)
    retired = [r["key"] for r in ranking if r["retiring"]]
    fleet = existing_fleet(scenario, base_year, set(retired), opts["retireByYear"], opts["maxPower"])
    fill_priority = [r["key"] for r in ranking if r["eligible"]]
    start_year = start_years_for(opts.get("startYears") or {}, opts["weights"])
    fill = auto_fill(demand, {**fleet, "fillPriority": fill_priority}, start_year)
    filled = top_up_every_year(demand, fill["scenario"], start_year)
    last = years[-1]
    added = {}
    for s in filled["sources"]:
        before = next(f for f in fleet["sources"] if f["key"] == s["key"])
        add = source_capacity(s, last) - source_capacity(before, last)
        if add > 0.005 * W_PER_GW:
            added[s["key"]] = add
    supply = compute_supply(filled, years)
    shortfall = []
    for d in demand:
        twh = 0.0
        firm = 0.0
        for p in supply:
            if p["year"] != d["year"]:
                continue
            twh += p["energy"]
            firm += p["firmPower"]
        gap_twh = d["energy"] - twh
        gap_gw = d["peak"] - firm
        if gap_twh > SHORTFALL_ENERGY_EPS or gap_gw > SHORTFALL_POWER_EPS:
            shortfall.append({"year": d["year"], "energy": max(0.0, gap_twh), "peak": max(0.0, gap_gw)})
    return {
        "scenario": filled,
        "ranking": ranking,
        "added": added,
        "retired": retired,
        "shortfall": shortfall,
        "startYear": start_year,
    }


def mix_metrics(points: list[dict], scores: dict, factor=factor_of) -> list[dict]:
    """ציון התמהיל (משוקלל באנרגיה) והפליטות (kg) בכל שנה; factor: מקדמי המקורות (factors_of)."""
    by_year: dict[int, dict] = {}
    for p in points:
        t = by_year.setdefault(
            p["year"],
            {
                "energy": 0.0,
                "mt": 0.0,
                "s": {"security": 0.0, "affordability": 0.0, "sustainability": 0.0, "feasibility": 0.0},
            },
        )
        sc = score_of(scores, p["source"])
        t["energy"] += p["energy"]
        t["mt"] += source_co2(factor(p["source"]), p["energy"])
        for k in ("security", "affordability", "sustainability", "feasibility"):
            t["s"][k] += sc[k] * p["energy"]
    out = []
    for year, t in by_year.items():
        k = 1 / t["energy"] if t["energy"] > 0 else 0
        out.append({"year": year, "co2": t["mt"], "score": {a: v * k for a, v in t["s"].items()}})
    return out
