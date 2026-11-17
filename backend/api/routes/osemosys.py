"""הרצות OSeMOSYS ברקע: שליחה, מצב, תוצאה וביטול; ופרטי המודל."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from energy_model import schema
from energy_model.data import catalog, demand_preset, supply_preset
from energy_model.osemosys.build import build_model_dict, energy_system

from ..deps import require_token

router = APIRouter(prefix="/api/osemosys", tags=["osemosys"])


class RunRequest(BaseModel):
    demand: schema.DemandScenario
    supply: schema.SupplyScenario
    #: free: הזול ביותר; capped: גם maxPower של הדשבורד; follow: עקומות הדשבורד הן מינימום.
    runMode: Literal["free", "capped", "follow"] = "free"


@router.get("/model")
def model_info() -> dict:
    """המודל שנבנה מהנתונים של הדשבורד (בתרחיש הבינוני / מדיניות מוצהרת): שנים, פרקי זמן, סחורות, טכנולוגיות."""
    m = build_model_dict(demand_preset("medium"), supply_preset("medium", "declared"))
    return {
        "source": "dashboard data (src/data: scenarios, catalog.json, energySystem.json)",
        "region": energy_system()["region"],
        "years": m["time_definition"]["years"],
        "timeslices": m["time_definition"]["timeslices"],
        "commodities": [{"id": c["id"], "demand": "demand_annual" in c} for c in m["commodities"]],
        "technologies": [{"id": t["id"]} for t in m["technologies"]],
        "sectors": catalog()["sectors"],
        "sources": catalog()["sources"],
    }


def _view(request: Request, run: dict) -> dict:
    out = {k: v for k, v in run.items() if k != "request"}
    out["queuePosition"] = request.app.state.runner.queue_position(run["id"])
    out["log"] = request.app.state.store.log_tail(run["id"])
    out["runMode"] = run["request"].get("runMode")
    return out


@router.post("/runs", dependencies=[Depends(require_token)])
def submit(r: RunRequest, request: Request) -> dict:
    """מוסיף הרצה לתור; מחזיר אותה מיד (status: queued)."""
    payload = {
        "demand": schema.dump(r.demand),
        "supply": schema.dump(r.supply),
        "runMode": r.runMode,
    }
    return _view(request, request.app.state.runner.submit(payload))


@router.get("/runs")
def list_runs(request: Request) -> list[dict]:
    """ההרצות האחרונות."""
    return request.app.state.store.list_runs()


@router.get("/runs/{rid}")
def get_run(rid: str, request: Request) -> dict:
    """מצב ההרצה, המקום בתור וסוף הלוג."""
    run = request.app.state.store.get_run(rid)
    if run is None:
        raise HTTPException(404, "run not found")
    return _view(request, run)


@router.get("/runs/{rid}/result")
def get_result(rid: str, request: Request) -> dict:
    """התוצאה של הרצה שהסתיימה."""
    result = request.app.state.store.get_result(rid)
    if result is None:
        raise HTTPException(404, "no result (yet)")
    return result


@router.delete("/runs/{rid}", dependencies=[Depends(require_token)])
def cancel(rid: str, request: Request) -> dict:
    """מבטל הרצה בתור או רצה."""
    if not request.app.state.runner.cancel(rid):
        raise HTTPException(409, "run is not queued or running")
    return {"cancelled": rid}
