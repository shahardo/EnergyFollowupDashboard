"""יחידות: כל הנתונים והחישובים ב-SI בסיסי (J, W, kg, m³, $, שברים), כמו src/model/units.ts.

ההמרה ליחידות תצוגה (TWh, GW, Mtoe, BCM, Mt, %) נעשית רק בתצוגה. השנה היא צעד הזמן של המודל.
"""

from __future__ import annotations

#: שניות בשנה (365 ימים, 8760 שעות).
SECONDS_PER_YEAR = 8760 * 3600
#: J ב-TWh.
J_PER_TWH = 3.6e15
#: J ב-PJ.
J_PER_PJ = 1e15
#: W ב-GW.
W_PER_GW = 1e9
#: W ב-MW.
W_PER_MW = 1e6
#: J בטון שווה ערך נפט.
J_PER_TOE = 41.868e9
#: kg במיליון טון.
KG_PER_MT = 1e9
#: m³ ב-BCM.
M3_PER_BCM = 1e9
#: תוכן האנרגיה של מ"ק גז טבעי (J).
J_PER_M3_GAS = (10.3 * J_PER_TWH) / M3_PER_BCM


def energy_of(power: float, cf: float) -> float:
    """E[J] של הספק [W] במקדם ניצול cf לאורך שנה."""
    return power * cf * SECONDS_PER_YEAR


def from_twh(twh: float) -> float:
    """TWh → J."""
    return twh * J_PER_TWH


def to_twh(j: float) -> float:
    """J → TWh."""
    return j / J_PER_TWH


def from_gw(gw: float) -> float:
    """GW → W."""
    return gw * W_PER_GW


def to_gw(w: float) -> float:
    """W → GW."""
    return w / W_PER_GW


def from_pct(pct: float) -> float:
    """אחוזים → שבר."""
    return pct / 100
