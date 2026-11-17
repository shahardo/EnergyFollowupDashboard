"""בונה את תשעת תרחישי ההיצע המוכנים: התאום של scripts/fit-supply-presets.ts.

לכל תרחיש ביקוש ומדיניות: תבנית המדיניות, כללי התכנון שלה (planPresets.json), ומילוי בגז. הקבצים שנכתבים
זהים עד הבית לאלה של `npm run fit:supply` (נבדק ב-CI).

הרצה: python -m energy_model.fit_presets  [--check]
"""

from __future__ import annotations

import argparse
import sys

from .data import DEMAND_PRESETS, SUPPLY_PRESETS, data_dir, demand_preset, plan_presets, policy_template
from .jsjson import stringify
from .plan import apply_plan_rules
from .supply import compute_demand_series, compute_series

#: התוויות של התרחישים, כמו ב-he.ts (plan.supplyPresets / plan.demandPresets).
SUPPLY_LABELS = {"reference": "תרחיש ייחוס", "declared": "מדיניות מוצהרת", "tested": "מדיניות נבחנת"}
DEMAND_LABELS = {"low": "ביקוש נמוך", "medium": "ביקוש בינוני", "high": "ביקוש גבוה"}


def fmt_line(item) -> str:
    """שורת JSON בעיצוב הקבצים: רווח אחרי פסיקים ונקודתיים (כמו fmtLine)."""
    return stringify(item).replace(',"', ', "').replace('":', '": ').replace("},{", "}, {")


def render(s: dict) -> str:
    """תרחיש היצע כקובץ שמור: שדה בכל שורה, ומקור בכל שורה."""
    head = {k: v for k, v in s.items() if k != "sources"}
    lines = [f"    {stringify(k)}: {fmt_line(v)}," for k, v in head.items()]
    out = [
        "{",
        '  "schema": "energy-dashboard/v1",',
        '  "kind": "supply",',
        '  "savedAt": "2026-11-10T00:00:00.000Z",',
        '  "data": {',
        *lines,
        '    "sources": [',
        ",\n".join("      " + fmt_line(x) for x in s["sources"]),
        "    ]",
        "  }",
        "}",
        "",
    ]
    return "\n".join(out)


def fit(level: str, policy: str) -> dict:
    """התרחיש המותאם לתרחיש ביקוש ולמדיניות."""
    demand = compute_demand_series(demand_preset(level))
    template = policy_template(policy)
    adjusted = apply_plan_rules({**template, "planParams": plan_presets()[policy]}, demand["totals"])
    name = f"{SUPPLY_LABELS[policy]} · {DEMAND_LABELS[level]} (ערכי דוגמה)"
    return {**adjusted, "id": f"preset-supply-{level}-{policy}", "name": name, "preset": policy, "demandPreset": level}


def worst_coverage(level: str, s: dict) -> tuple[float, float]:
    """הכיסוי בשנה הגרועה ביותר (אנרגיה, שיא), באחוזים."""
    gap = compute_series(compute_demand_series(demand_preset(level)), s)["gap"]
    return min(g["coveragePct"] for g in gap), min(g["peakCoveragePct"] for g in gap)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="רק להשוות לקבצים הקיימים, בלי לכתוב")
    args = ap.parse_args(argv)
    bad = 0
    for level in DEMAND_PRESETS:
        for policy in SUPPLY_PRESETS:
            s = fit(level, policy)
            path = data_dir() / "scenarios" / f"supply-{level}-{policy}.json"
            text = render(s)
            e, p = worst_coverage(level, s)
            if args.check:
                same = path.read_text(encoding="utf-8") == text
                bad += not same
                print(f"{level}-{policy}: {'same' if same else 'DIFFERENT'}  energy {e:.1f}%  peak {p:.1f}%")
            else:
                path.write_text(text, encoding="utf-8")
                print(f"{level}-{policy}: energy {e:.1f}%  peak {p:.1f}%")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
