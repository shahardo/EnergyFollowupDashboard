"""חישובים של מנוע ה-Python: אותן תוצאות כמו מנוע ה-TypeScript של הדשבורד (נבדק מול קובצי הייחוס)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from energy_model import schema
from energy_model.autofill import auto_adjust
from energy_model.data import plan_presets
from energy_model.plan import apply_plan_rules, measure_non_electric, plan_supply, project_non_electric
from energy_model.priority import ideal_supply
from energy_model.supply import compute_demand_series, compute_series

router = APIRouter(prefix="/api", tags=["compute"])


class Pair(BaseModel):
    demand: schema.DemandScenario
    supply: schema.SupplyScenario


class PriorityOptions(BaseModel):
    weights: dict[Literal["sustainability", "affordability", "security", "feasibility"], float]
    minFeasibilityPct: float = Field(ge=0, le=100)
    retireBelow: float = Field(ge=0, le=10)
    retireByYear: int
    maxGW: dict[str, float | None]
    startYears: dict[str, dict[Literal["earliest", "realistic"], int]] | None = None


class IdealRequest(Pair):
    #: ציוני הטרילמה לכל ערוץ (חייב לכלול "other", לערוצים שחסרים).
    scores: dict[str, schema.TrilemmaScore]
    options: PriorityOptions


def _dicts(p: Pair) -> tuple[dict, dict]:
    return schema.dump(p.demand), schema.dump(p.supply)


@router.post("/series")
def series(p: Pair) -> dict:
    """ביקוש לפי מגזר, ביקוש נטו, היצע לפי מקור והפער (computeSeries)."""
    d, s = _dicts(p)
    return compute_series(compute_demand_series(d), s)


@router.post("/plan-supply")
def plan(p: Pair) -> dict:
    """האספקה של טאב תכנון התרחישים (planSupply)."""
    d, s = _dicts(p)
    ds = compute_demand_series(d)
    m = measure_non_electric(d, project_non_electric(d, ds["demandPoints"]), ds["years"])
    fuels = [
        {"year": y, "fuelsTWh": m["fuels"][i]["netTWh"], "gasTWh": m["gas"][i]["netTWh"]}
        for i, y in enumerate(ds["years"])
    ]
    params = s.get("planParams") or plan_presets()[s.get("preset") or "declared"]
    return plan_supply(s, params, ds["years"], ds["totals"], fuels, d["horizonYear"])


@router.post("/auto-adjust")
def adjust(p: Pair) -> dict:
    """התאמה אוטומטית של ההיצע לביקוש נטו (autoAdjust)."""
    d, s = _dicts(p)
    return auto_adjust(compute_demand_series(d)["totals"], s)


@router.post("/apply-plan-rules")
def rules(p: Pair) -> dict:
    """כל כללי התכנון ומילוי בגז (applyPlanRules)."""
    d, s = _dicts(p)
    if not s.get("planParams"):
        s["planParams"] = plan_presets()[s.get("preset") or "declared"]
    return apply_plan_rules(s, compute_demand_series(d)["totals"])


@router.post("/ideal-supply")
def ideal(r: IdealRequest) -> dict:
    """העקומה האידאלית של טאב התעדוף (idealSupply)."""
    d, s = _dicts(r)
    scores = {k: v.model_dump() for k, v in r.scores.items()}
    scores.setdefault("other", {"security": 5, "affordability": 5, "sustainability": 5, "feasibilityPct": 50})
    return ideal_supply(compute_demand_series(d)["totals"], s, scores, r.options.model_dump(exclude_none=True))
