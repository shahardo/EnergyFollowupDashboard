"""מודלי ה-Pydantic זהים לסכמות ה-Zod של הדשבורד: אותם שדות, חובה/רשות, טיפוסים, טווחים וערכי enum.

zod-schema.json נכתב מ-TypeScript (`npm run schema`); vitest בודק שהוא מעודכן.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from energy_model import schema

ZOD = json.loads((Path(__file__).parent / "zod-schema.json").read_text(encoding="utf-8"))
MODELS = {
    "DemandScenario": schema.DemandScenario,
    "SupplyScenario": schema.SupplyScenario,
    "ProjectsData": schema.ProjectsData,
    "TrilemmaScore": schema.TrilemmaScore,
}


def resolve(node: dict, defs: dict) -> dict:
    if "$ref" in node:
        return resolve(defs[node["$ref"].split("/")[-1]], defs)
    if "anyOf" in node:  # Optional[X] של Pydantic: anyOf [X, null]
        opts = [o for o in node["anyOf"] if o.get("type") != "null"]
        if len(opts) == 1:
            return resolve(
                {**opts[0], **{k: v for k, v in node.items() if k not in ("anyOf", "default", "title")}}, defs
            )
    if "allOf" in node and len(node["allOf"]) == 1:
        return resolve(node["allOf"][0], defs)
    return node


def norm(node: dict, defs: dict):
    """צורה פשוטה להשוואה: אובייקט → שדות וחובה; מערך → פריט ומינימום; ערך → טיפוס, טווח, enum."""
    node = resolve(node, defs)
    t = node.get("type")
    if t == "object" or "properties" in node:
        props = node.get("properties", {})
        return {
            "props": {k: norm(v, defs) for k, v in props.items()},
            "required": sorted(node.get("required", [])),
        }
    if t == "array":
        return {"items": norm(node["items"], defs), "minItems": node.get("minItems")}
    out = {"type": t}
    if "const" in node:
        out = {"type": "string", "enum": [node["const"]]}
    for k in ("enum", "minimum", "maximum", "exclusiveMinimum", "minLength", "pattern"):
        if k in node:
            out[k] = node[k]
    if "enum" in out:
        out["enum"] = sorted(out["enum"])
        out["type"] = "string"
    # Zod מתאר תאריך ISO כ-pattern משלו; כאן רק בודקים שגם Pydantic בודק תבנית.
    if "pattern" in out:
        out["pattern"] = "date"
    return out


@pytest.mark.parametrize("name", list(MODELS))
def test_pydantic_matches_zod(name):
    zod = norm(ZOD[name], ZOD[name].get("definitions", {}))
    js = MODELS[name].model_json_schema(by_alias=True)
    py = norm(js, js.get("$defs", {}))
    assert py == zod


def test_presets_validate():
    from energy_model.data import DEMAND_PRESETS, SUPPLY_PRESETS, demand_preset, supply_preset

    for d in DEMAND_PRESETS:
        schema.DemandScenario.model_validate(demand_preset(d))
        for p in SUPPLY_PRESETS:
            schema.SupplyScenario.model_validate(supply_preset(d, p))
