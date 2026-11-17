"""התאמה בין הדשבורד למודל OSeMOSYS: איזה מגזר הוא איזו סחורה, איזה מקור הוא אילו טכנולוגיות, והמרות יחידות.

הכול נגזר מהקטלוג המשותף (src/data/catalog.json), כך שהדשבורד והמודל מכסים בדיוק את אותם מגזרים ומקורות.
"""

from __future__ import annotations

from ..data import catalog

#: PJ ב-TWh אחד.
PJ_PER_TWH = 3.6
#: PJ שמייצר GW אחד שפועל שנה שלמה (8.76 TWh × 3.6).
PJ_PER_GW_YEAR = 8.76 * PJ_PER_TWH
#: יחסי היחידות של טכנולוגיה שבה המודל לא מגדיר אותם (ברירת המחדל של tz-osemosys).
DEFAULT_CAPACITY_ACTIVITY_RATIO = 1.0
#: האזור היחיד במודל.
REGION = "ISRAEL"
#: הסחורות שהטכנולוגיה מייצרת שהופכות אותה ל"תחנה" (הספק מותקן), ולא ליבוא שמוגבל רק בפעילות.
CAPACITY_OUTPUTS = ("Electricity", "Hydrogen")


def sector_commodities() -> dict[str, str]:
    """{מפתח מגזר או תת-מגזר בדשבורד: הסחורה במודל}."""
    out = {}
    for s in catalog()["sectors"]:
        if s.get("commodity"):
            out[s["key"]] = s["commodity"]
        for sub in s.get("subSectors") or []:
            out[sub["key"]] = sub["commodity"]
    return out


def source_technologies() -> dict[str, list[str]]:
    """{מפתח מקור בדשבורד: הטכנולוגיות שלו במודל}."""
    return {s["key"]: list(s["technologies"]) for s in catalog()["sources"]}


def technology_source() -> dict[str, str]:
    """{טכנולוגיה במודל: מפתח המקור בדשבורד}."""
    return {t: k for k, techs in source_technologies().items() for t in techs}


def is_infrastructure(tech_id: str) -> bool:
    """טכנולוגיה שאינה אפשרות אספקה: הרשת, ההפצה, כלי הרכב, החימום, ההמרה לביקוש ומשאבים חינמיים."""
    c = catalog()
    return tech_id in c["infrastructureTechnologies"] or tech_id.startswith(tuple(c["infrastructurePrefixes"]))


def is_capacity_tech(tech: dict) -> bool:
    """טכנולוגיה עם הספק מותקן (תחנה, אלקטרוליזר, אגירה), שעליה חלים ה-GW של הדשבורד."""
    if tech["id"].startswith("STO_"):
        return True
    for mode in tech.get("operating_modes") or []:
        if any(c in (mode.get("output_activity_ratio") or {}) for c in CAPACITY_OUTPUTS):
            return True
    return False


def model_capacity_per_gw(tech: dict) -> float:
    """כמה יחידות הספק של המודל הן GW אחד: PJ לשנה ל-GW, חלקי יחס היחידות של הטכנולוגיה.

    ב-osemosys_israel יחס היחידות הוא ברירת המחדל (1 PJ ליחידת הספק בשנה), כך שיחידת ההספק שם היא PJ לשנה.
    """
    ratio = tech.get("capacity_activity_unit_ratio", DEFAULT_CAPACITY_ACTIVITY_RATIO)
    if isinstance(ratio, dict):
        ratio = ratio.get(REGION, DEFAULT_CAPACITY_ACTIVITY_RATIO)
    return PJ_PER_GW_YEAR / float(ratio)
