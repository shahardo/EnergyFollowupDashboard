"""תרחישים שמורים בשרת: אותה מעטפת כמו קובצי ה-JSON של הדשבורד (energy-dashboard/v1)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import Field

from energy_model import schema

from ..deps import require_token

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])

Envelope = Annotated[schema.DemandFile | schema.SupplyFile | schema.ProjectsFile, Field(discriminator="kind")]


@router.get("")
def list_scenarios(request: Request) -> list[dict]:
    """כל התרחישים השמורים (meta), החדשים קודם."""
    return request.app.state.store.list_scenarios()


@router.get("/{sid}")
def get_scenario(sid: str, request: Request) -> dict:
    """המעטפת השמורה, כמו קובץ שנפתח."""
    env = request.app.state.store.get_scenario(sid)
    if env is None:
        raise HTTPException(404, "scenario not found")
    return env


@router.post("", dependencies=[Depends(require_token)])
def save_scenario(request: Request, file: Envelope = Body(...)) -> dict:
    """שומר קובץ (ביקוש, היצע או משימות) ומחזיר את ה-meta שלו."""
    return request.app.state.store.save_scenario(file.model_dump(exclude_none=True, by_alias=True))


@router.put("/{sid}", dependencies=[Depends(require_token)])
def replace_scenario(sid: str, request: Request, file: Envelope = Body(...)) -> dict:
    """מחליף תרחיש שמור (שמירה לאותו מקום)."""
    store = request.app.state.store
    if store.get_scenario(sid) is None:
        raise HTTPException(404, "scenario not found")
    return store.save_scenario(file.model_dump(exclude_none=True, by_alias=True), sid)


@router.delete("/{sid}", dependencies=[Depends(require_token)])
def delete_scenario(sid: str, request: Request) -> dict:
    """מוחק תרחיש שמור."""
    if not request.app.state.store.delete_scenario(sid):
        raise HTTPException(404, "scenario not found")
    return {"deleted": sid}
