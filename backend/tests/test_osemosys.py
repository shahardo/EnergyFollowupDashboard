"""מודל OSeMOSYS: הקטלוג מכסה את המודל בשני הכיוונים, המודל המקורי נותן את התוצאה המפורסמת, ותרחיש של
הדשבורד נפתר (כולל המקורות והמגזרים שהוספנו למודל)."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
import yaml

from energy_model.data import catalog, demand_preset, supply_preset
from energy_model.osemosys.build import build_model_dict, dashboard_demand_pj, merged_model, model_years
from energy_model.osemosys.mapping import is_infrastructure, sector_commodities, source_technologies
from energy_model.supply import compute_demand_series

DATA = Path(__file__).parents[1] / "energy_model" / "osemosys" / "data"


def test_catalog_covers_the_model_both_ways():
    model = merged_model()
    techs = {t["id"] for t in model["technologies"]}
    claimed = {t for ts in source_technologies().values() for t in ts}
    # every dashboard source's technologies exist in the model (with our additions)
    assert claimed <= techs, sorted(claimed - techs)
    # every model technology is a dashboard source's or part of the energy chain behind the sectors
    orphans = sorted(t for t in techs if t not in claimed and not is_infrastructure(t))
    assert orphans == []
    # every source in the catalogue has technologies, except the legacy "other"
    assert [k for k, ts in source_technologies().items() if not ts] == ["other"]
    # every demand commodity in the model is a dashboard sector or sub-sector, and vice versa
    demand_commodities = {c["id"] for c in model["commodities"] if c.get("demand_annual")}
    mapped = set(sector_commodities().values())
    assert demand_commodities <= mapped, sorted(demand_commodities - mapped)
    assert mapped <= {c["id"] for c in model["commodities"]}


def test_added_items_are_marked_in_the_catalogue():
    base = {t["id"] for t in yaml.safe_load((DATA / "israel_energy_model.yaml").read_text())["technologies"]}
    for s in catalog()["sources"]:
        new = [t for t in s["technologies"] if t not in base]
        assert bool(new) == bool(s.get("addedToOsemosys")), s["key"]


def test_dashboard_demand_matches_the_dashboard_totals():
    d = demand_preset("medium")
    pj = dashboard_demand_pj(d)
    ds = compute_demand_series(d)
    elec_sectors = [c for k, c in sector_commodities().items() if c.startswith("Elec")]
    for i, y in enumerate(ds["years"]):
        # the electricity-only commodities carry exactly the dashboard's net electricity of those sectors
        expected = (
            sum(
                p["twh"]
                for p in ds["demandPoints"]
                if p["year"] == y and sector_commodities().get(p["sector"], "").startswith("Elec")
            )
            * ds["totals"][i]["twh"]
            / ds["grossTotals"][i]["twh"]
        )
        got = sum(pj[c][y] for c in elec_sectors) / 3.6
        assert math.isclose(got, expected, rel_tol=1e-9)


def test_build_sets_fleet_limits_and_earliest_years():
    d, s = demand_preset("medium"), supply_preset("medium", "declared")
    m = build_model_dict(d, s, "capped")
    techs = {t["id"]: t for t in m["technologies"]}
    years = model_years(m)
    # coal: 4.8 GW until its retire year, in model capacity units (31.536 PJ per GW-year / ratio 1)
    coal = s["sources"][[x["key"] for x in s["sources"]].index("coal")]
    res = techs["PWR_Coal"]["residual_capacity"]
    assert res["2025"] == pytest.approx(4.8 * 31.536) and res[str(coal["retireYear"])] == 0
    # a disabled source cannot be built; an enabled one keeps its cap
    assert all(v == 0 for v in techs["PWR_Nuclear_SMR"]["capacity_gross_max"].values())
    assert techs["PWR_Solar_Utility"]["capacity_gross_max"]["2050"] == pytest.approx(70 * 31.536)
    # fusion is in the model, but cannot be built before 2040
    fusion = techs["PWR_Fusion"]["capacity_additional_max"]
    assert fusion["2039"] == 0 and fusion["2040"] > 0 and len(fusion) == len(years)
    assert "earliest_year" not in techs["PWR_Fusion"]
    # the new demand commodities get the dashboard's demand
    commodities = {c["id"]: c for c in m["commodities"]}
    assert commodities["ElecPA"]["demand_annual"]["ISRAEL"]["2025"] == pytest.approx(6.5 * 3.6)


def test_vendored_model_reproduces_the_published_objective():
    from tz.osemosys import Model

    reference = json.loads((DATA / "reference.json").read_text())["totalDiscountedCost"]
    m = Model.from_yaml(str(DATA / "israel_energy_model.yaml"))
    status, _ = m.solve(solver_name="highs")
    assert status == "ok"
    assert float(m.objective) == pytest.approx(reference, rel=1e-5)


def test_dashboard_scenario_solves_with_the_added_options():
    from energy_model.osemosys.solve import run

    r = run(demand_preset("medium"), supply_preset("medium", "declared"), "follow")
    assert r["status"] == "optimal"
    cap = {(c["source"], c["year"]): c["gw"] for c in r["capacity"]}
    # follow mode keeps at least the dashboard's capacity, including the sources we added to the model
    for key in ("solar", "fusion", "geothermal", "importElectricity"):
        src = next(x for x in supply_preset("medium", "declared")["sources"] if x["key"] == key)
        dashboard_2050 = max(p["gw"] for p in src["capacityGW"] if p["year"] <= 2050)
        assert cap[(key, 2050)] >= dashboard_2050 - 1e-6, key
    assert all(e["mtCo2"] >= -1e-6 for e in r["emissions"])
    assert r["objective"] > 0
