"""עזרים בסיסיים: שנים, עיגול וחסימה (פורט של src/model/years.ts ו-src/model/math.ts).

כל הפונקציות שומרות על ההתנהגות של גרסת ה-TypeScript, כולל העיגול של JavaScript (Math.round מעגל
חצי כלפי מעלה, ולא "עיגול בנקאי" כמו round של Python).
"""

from __future__ import annotations

import math

from .units import SECONDS_PER_YEAR, W_PER_GW  # noqa: F401  (re-exported)

#: צעד העיגול של הספק: 0.01 GW (‎1e7 W).
POWER_STEP = 0.01 * W_PER_GW

INF = math.inf


def year_range(start: int, end: int) -> list[int]:
    """כל השנים מ-start עד end, כולל שתיהן."""
    return list(range(int(start), int(end) + 1))


def clamp(v: float, lo: float, hi: float) -> float:
    """v בתוך הטווח lo..hi."""
    return min(hi, max(lo, v))


def linear_share(x: float, a: float, b: float) -> float:
    """המיקום היחסי (0..1) של x בין a ל-b, חסום. בטווח מנוון (b ≤ a): 1 מ-b והלאה, 0 לפניו."""
    if b <= a:
        return 1.0 if x >= b else 0.0
    return clamp((x - a) / (b - a), 0.0, 1.0)


def js_round(v: float) -> float:
    """Math.round של JavaScript: חצי מעוגל כלפי מעלה (לכיוון +∞)."""
    return math.floor(v + 0.5)


def round_up_power(w: float) -> float:
    """עיגול הספק (W) כלפי מעלה לצעד של 0.01 GW, עם סובלנות של 1e-6 (כמו roundUpPower)."""
    return math.ceil(w / POWER_STEP - 1e-6) * POWER_STEP


def round_power(w: float) -> float:
    """עיגול רגיל של הספק (W) לצעד של 0.01 GW (כמו roundPower)."""
    return js_round(w / POWER_STEP) * POWER_STEP


def round2(v: float) -> float:
    """עיגול רגיל ל-0.01 (כמו round2)."""
    return js_round(v * 100) / 100
