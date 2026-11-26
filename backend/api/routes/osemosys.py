"""הרצות OSeMOSYS ברקע: שליחה, מצב, תוצאה וביטול; ופרטי המודל."""

from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from energy_model import schema
from energy_model.data import catalog, demand_preset, supply_preset
from energy_model.osemosys.build import build_model_dict, energy_system
from energy_model.osemosys.params import parameters

from ..deps import require_token
from ..runner import KILL_GRACE

#: כל כמה שניות בקשה שמחכה להרצה בודקת אותה (RUN_IN_REQUEST).
WAIT_POLL = 0.5

router = APIRouter(prefix="/api/osemosys", tags=["osemosys"])


class RunRequest(BaseModel):
    demand: schema.DemandScenario
    supply: schema.SupplyScenario
    #: free: הזול ביותר; capped: גם maxPower של הדשבורד; follow: עקומות הדשבורד הן מינימום.
    runMode: Literal["free", "capped", "follow"] = "free"


class RenameRequest(BaseModel):
    #: The run's display name; empty or null removes it.
    name: str | None = None


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
    """מוסיף הרצה לתור ומחזיר אותה: מיד (status: queued), או בסופה כש-RUN_IN_REQUEST מוגדר."""
    payload = {
        "demand": schema.dump(r.demand),
        "supply": schema.dump(r.supply),
        "runMode": r.runMode,
    }
    params = parameters(payload["demand"], payload["supply"], r.runMode)
    run = request.app.state.runner.submit(payload)
    # הפרמטרים שהפותר מקבל נשמרים עם ההרצה, כך שאפשר לראות אחר כך על מה היא רצה
    request.app.state.store.save_params(run["id"], params)
    settings = request.app.state.settings
    if settings.run_in_request:
        # מחכים כאן (הפונקציה רצה ב-thread pool) כדי שהבקשה תישאר פתוחה עד הסוף
        deadline = time.monotonic() + settings.run_time_limit + KILL_GRACE
        while time.monotonic() < deadline:
            current = request.app.state.store.get_run(run["id"])
            if current and current["status"] not in ("queued", "running"):
                run = current
                break
            time.sleep(WAIT_POLL)
    return _view(request, run)


@router.get("/runs")
def list_runs(request: Request, limit: int = Query(20, ge=1, le=500)) -> list[dict]:
    """The latest runs, newest first."""
    return request.app.state.store.list_runs(limit)


@router.get("/runs/{rid}")
def get_run(rid: str, request: Request) -> dict:
    """מצב ההרצה, המקום בתור וסוף הלוג."""
    run = request.app.state.store.get_run(rid)
    if run is None:
        raise HTTPException(404, "run not found")
    return _view(request, run)


@router.get("/runs/{rid}/log")
def get_log(rid: str, request: Request, offset: int = 0) -> dict:
    """הפלט של הפותר מהבית offset (למעקב בזמן אמת: כל קריאה מבקשת מהמיקום שהקודמת החזירה)."""
    store = request.app.state.store
    run = store.get_run(rid)
    if run is None:
        raise HTTPException(404, "run not found")
    text, nxt = store.read_log(rid, offset)
    return {"text": text, "offset": nxt, "status": run["status"]}


@router.get("/runs/{rid}/parameters")
def get_parameters(rid: str, request: Request) -> dict:
    """פרמטרי המודל של ההרצה; להרצה ישנה בלי קובץ פרמטרים הם מחושבים מהבקשה שלה (ונשמרים)."""
    store = request.app.state.store
    params = store.get_params(rid)
    if params is None:
        run = store.get_run(rid)
        if run is None:
            raise HTTPException(404, "run not found")
        req = run["request"]
        params = parameters(req["demand"], req["supply"], req.get("runMode", "free"))
        store.save_params(rid, params)
    return params


@router.get("/runs/{rid}/result")
def get_result(rid: str, request: Request) -> dict:
    """התוצאה של הרצה שהסתיימה."""
    result = request.app.state.store.get_result(rid)
    if result is None:
        raise HTTPException(404, "no result (yet)")
    return result


@router.post("/runs/{rid}/cancel", dependencies=[Depends(require_token)])
def cancel(rid: str, request: Request) -> dict:
    """Cancels a queued or running run."""
    if not request.app.state.runner.cancel(rid):
        raise HTTPException(409, "run is not queued or running")
    return {"cancelled": rid}


@router.patch("/runs/{rid}", dependencies=[Depends(require_token)])
def rename(rid: str, body: RenameRequest, request: Request) -> dict:
    """Renames a run (an empty name removes it)."""
    run = request.app.state.store.rename_run(rid, body.name)
    if run is None:
        raise HTTPException(404, "run not found")
    return _view(request, run)


@router.delete("/runs/{rid}", dependencies=[Depends(require_token)])
def delete(rid: str, request: Request) -> dict:
    """Deletes a finished run with its result, log and parameters (also from the bucket mirror)."""
    store = request.app.state.store
    run = store.get_run(rid)
    if run is None:
        raise HTTPException(404, "run not found")
    if run["status"] in ("queued", "running"):
        raise HTTPException(409, "run is queued or running: cancel it first")
    store.delete_run(rid)
    return {"deleted": rid}
