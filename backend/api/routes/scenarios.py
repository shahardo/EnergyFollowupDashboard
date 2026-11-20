"""תרחישים שמורים בשרת: אותה מעטפת כמו קובצי ה-JSON של הדשבורד (energy-dashboard/v2; v1 מומרת בשמירה)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import Field, TypeAdapter, ValidationError

from energy_model import schema
from energy_model.migrate import migrate_file

from ..deps import require_token

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])

Envelope = Annotated[schema.DemandFile | schema.SupplyFile | schema.ProjectsFile, Field(discriminator="kind")]
_ENVELOPE = TypeAdapter(Envelope)


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


def _validated(raw: dict) -> dict:
    """קובץ v1 מומר ל-v2 (SI); אחר כך נבדק מול הסכמה. נשמר תמיד ב-v2."""
    try:
        file = _ENVELOPE.validate_python(migrate_file(raw))
    except (ValidationError, KeyError, TypeError) as e:
        raise HTTPException(422, f"invalid scenario file: {e}") from e
    return file.model_dump(exclude_none=True, by_alias=True)


@router.post("", dependencies=[Depends(require_token)])
def save_scenario(request: Request, file: dict = Body(...)) -> dict:
    """שומר קובץ (ביקוש, היצע או משימות; v1 או v2) ומחזיר את ה-meta שלו."""
    return request.app.state.store.save_scenario(_validated(file))


@router.put("/{sid}", dependencies=[Depends(require_token)])
def replace_scenario(sid: str, request: Request, file: dict = Body(...)) -> dict:
    """מחליף תרחיש שמור (שמירה לאותו מקום)."""
    store = request.app.state.store
    if store.get_scenario(sid) is None:
        raise HTTPException(404, "scenario not found")
    return store.save_scenario(_validated(file), sid)


@router.delete("/{sid}", dependencies=[Depends(require_token)])
def delete_scenario(sid: str, request: Request) -> dict:
    """מוחק תרחיש שמור."""
    if not request.app.state.store.delete_scenario(sid):
        raise HTTPException(404, "scenario not found")
    return {"deleted": sid}
