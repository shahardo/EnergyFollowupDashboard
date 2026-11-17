"""הנתונים המשותפים עם הדשבורד: הקטלוג, התרחישים המוכנים, תבניות המדיניות וכללי התכנון.

כולם נקראים מאותם קובצי JSON שהדשבורד קורא (src/data). התיקייה נקבעת ב-ENERGY_DATA_DIR, או נמצאת
יחסית לחבילה (backend/energy_model → ../../src/data), גם בתוך תמונת ה-Docker.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from .supply import interpolate_capacity

DEMAND_PRESETS = ("low", "medium", "high")
SUPPLY_PRESETS = ("reference", "declared", "tested")
BASE_YEAR = 2025


def data_dir() -> Path:
    """התיקייה של src/data."""
    env = os.environ.get("ENERGY_DATA_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2] / "src" / "data"


def read_json(rel: str) -> dict:
    """קובץ JSON מתוך src/data."""
    return json.loads((data_dir() / rel).read_text(encoding="utf-8"))


@lru_cache
def catalog() -> dict:
    """הקטלוג המשותף (catalog.json)."""
    return read_json("catalog.json")


def demand_preset(level: str) -> dict:
    """תרחיש ביקוש מוכן (data של הקובץ)."""
    return read_json(f"scenarios/demand-{level}.json")["data"]


def supply_preset(level: str, policy: str) -> dict:
    """תרחיש היצע מוכן לתרחיש ביקוש ולמדיניות."""
    return read_json(f"scenarios/supply-{level}-{policy}.json")["data"]


def policy_template(policy: str) -> dict:
    """תבנית מדיניות (src/data/policies)."""
    return read_json(f"policies/supply-{policy}.json")["data"]


@lru_cache
def plan_presets() -> dict:
    """כללי התכנון לכל מדיניות, עם הסולארי של שנת הבסיס מתבנית המדיניות המוצהרת (כמו scenarioPlan.ts)."""
    raw = read_json("planPresets.json")
    solar = next((s for s in policy_template("declared")["sources"] if s["key"] == "solar"), None)
    base = interpolate_capacity(solar["capacity"], BASE_YEAR) if solar else 5.7e9
    out = {}
    for p in SUPPLY_PRESETS:
        r = raw[p]
        params = {**{k: v for k, v in r.items() if k != "solar"}}
        # אותו סדר מפתחות כמו ב-Zod (סדר הסכמה), כדי שהקובץ שנכתב יהיה זהה.
        out[p] = {
            "solar": {"base": base, "slope": r["solar"]["slope"]},
            "solar30": params["solar30"],
            "solar40": params["solar40"],
            "importElectricity": params["importElectricity"],
            "geothermal": params["geothermal"],
            "fusion": params["fusion"],
            "cleanFuels": params["cleanFuels"],
            "hydrogen": params["hydrogen"],
        }
    return out
