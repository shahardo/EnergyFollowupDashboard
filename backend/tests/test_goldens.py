"""מנוע ה-Python מול תוצאות הייחוס של מנוע ה-TypeScript (npm run goldens), לכל צירוף ביקוש × מדיניות."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from energy_model.autofill import auto_adjust
from energy_model.demand import project_sub_sectors
from energy_model.fuel import factors_of, fuel_ratios
from energy_model.plan import measure_non_electric, plan_supply, project_non_electric
from energy_model.priority import ideal_supply, mix_metrics
from energy_model.supply import compute_demand_series, compute_series

GOLDENS = sorted((Path(__file__).parent / "goldens").glob("*.json"))
TOL = 1e-9


def assert_close(a, b, path="$"):
    """השוואה עמוקה: מספרים עד 1e-9 (יחסי או מוחלט), כל השאר בשוויון; אותם מפתחות ואותו סדר רשימות."""
    if isinstance(b, bool) or b is None or isinstance(b, str):
        assert a == b, f"{path}: {a!r} != {b!r}"
    elif isinstance(b, (int, float)):
        assert isinstance(a, (int, float)) and not isinstance(a, bool), f"{path}: {a!r} is not a number"
        assert math.isclose(a, b, rel_tol=TOL, abs_tol=TOL), f"{path}: {a!r} != {b!r}"
    elif isinstance(b, list):
        assert isinstance(a, list) and len(a) == len(b), (
            f"{path}: length {len(a) if isinstance(a, list) else a!r} != {len(b)}"
        )
        for i, (x, y) in enumerate(zip(a, b)):
            assert_close(x, y, f"{path}[{i}]")
    elif isinstance(b, dict):
        assert isinstance(a, dict), f"{path}: {a!r} is not an object"
        # JSON.stringify משמיט undefined; ב-Python מפתח עם None נחשב חסר.
        ka = [k for k, v in a.items() if v is not None]
        assert ka == list(b), f"{path}: keys {ka} != {list(b)}"
        for k in b:
            assert_close(a[k], b[k], f"{path}.{k}")
    else:  # pragma: no cover
        raise TypeError(type(b))


@pytest.fixture(params=GOLDENS, ids=[p.stem for p in GOLDENS])
def golden(request):
    return json.loads(request.param.read_text(encoding="utf-8"))


def test_goldens_exist():
    assert len(GOLDENS) == 9


def test_series(golden):
    inp = golden["input"]
    ds = compute_demand_series(inp["demand"])
    assert_close(compute_series(ds, inp["supply"]), golden["series"])
    assert_close(project_sub_sectors(inp["demand"]), golden["subSectors"])


def test_plan_supply(golden):
    inp = golden["input"]
    demand, supply = inp["demand"], inp["supply"]
    ds = compute_demand_series(demand)
    ne = project_non_electric(demand, ds["demandPoints"])
    assert_close(ne, golden["nonElectric"])
    m = measure_non_electric(demand, ne, ds["years"])
    assert_close(m, golden["nonElectricMeasured"])
    fuels = [
        {"year": y, "fuels": m["fuels"][i]["netEnergy"], "gas": m["gas"][i]["netEnergy"]}
        for i, y in enumerate(ds["years"])
    ]
    plan = plan_supply(supply, supply["planParams"], ds["years"], ds["totals"], fuels, demand["horizonYear"])
    assert_close(plan, golden["plan"])
    assert_close(
        fuel_ratios(compute_series(ds, supply)["supplyPoints"], ds["years"], factors_of(supply["sources"])),
        golden["fuelRatios"],
    )


def scaled(s: dict, k: float) -> dict:
    return {
        **s,
        "sources": [
            {**x, "capacity": [{"year": c["year"], "power": c["power"] * k} for c in x["capacity"]]}
            for x in s["sources"]
        ],
    }


def test_auto_adjust(golden):
    inp = golden["input"]
    ds = compute_demand_series(inp["demand"])
    assert_close(auto_adjust(ds["totals"], inp["supply"]), golden["autoAdjust"])
    deficit = auto_adjust(ds["totals"], scaled(inp["supply"], 0.6))
    assert_close(deficit, golden["autoAdjustDeficit"])
    surplus = auto_adjust(ds["totals"], scaled(inp["supply"], 1.5))
    assert_close(surplus, golden["autoAdjustSurplus"])


def test_ideal_supply(golden):
    inp = golden["input"]
    ds = compute_demand_series(inp["demand"])
    ideal = ideal_supply(ds["totals"], inp["supply"], inp["scores"], inp["priority"])
    assert_close(ideal, golden["ideal"])
    factors = factors_of(inp["supply"]["sources"])
    assert_close(
        mix_metrics(compute_series(ds, ideal["scenario"])["supplyPoints"], inp["scores"], factors), golden["mix"]
    )


def test_auto_adjust_cases_are_not_trivial():
    """the deficit / surplus goldens really exercise filling and scaling down"""
    files = [json.loads(p.read_text(encoding="utf-8")) for p in GOLDENS]
    assert sum(bool(g["autoAdjustDeficit"]["added"]) for g in files) >= 6
    assert sum(bool(g["autoAdjustSurplus"]["removed"]) for g in files) >= 6
