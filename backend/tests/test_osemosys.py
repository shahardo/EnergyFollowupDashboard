"""מודל OSeMOSYS שנבנה מהנתונים של הדשבורד: כל מקור ומגזר נמצא בו, הביקוש שווה לזה של הדשבורד, הגבולות של
מצבי ההרצה, פתרון של כל התרחישים, והייצוא בפריסה של osemosys_israel נפתר לאותה תוצאה."""

from __future__ import annotations

import logging
import math

import pytest

from energy_model.data import catalog, demand_preset, supply_preset
from energy_model.fuel import FINAL_EMISSION_FACTOR
from energy_model.osemosys.build import (
    J_PER_PJ,
    PJ_PER_GW_YEAR,
    build_model_dict,
    energy_system,
    final_energy,
    model_years,
    sector_commodities,
)
from energy_model.supply import compute_demand_series, source_capacity
from energy_model.units import SECONDS_PER_YEAR

logging.getLogger("linopy").setLevel(logging.WARNING)

LEVELS = ("low", "medium", "high")
POLICIES = ("reference", "declared", "tested")


def techs(m: dict) -> dict[str, dict]:
    return {t["id"]: t for t in m["technologies"]}


def test_every_source_and_sector_is_in_the_model():
    d, s = demand_preset("medium"), supply_preset("medium", "declared")
    m = build_model_dict(d, s)
    ids = techs(m)
    for src in catalog()["sources"]:
        assert src["technology"] in ids, src["key"]
    demands = {c["id"] for c in m["commodities"] if "demand_annual" in c}
    assert demands == {v["commodity"] for v in sector_commodities().values()}
    # every commodity a technology uses is made by another one (no dangling inputs)
    made = {c for t in m["technologies"] for mo in t["operating_modes"] for c in mo.get("output_activity_ratio", {})}
    used = {c for t in m["technologies"] for mo in t["operating_modes"] for c in mo.get("input_activity_ratio", {})}
    assert used <= made, sorted(used - made)
    assert model_years(d) == m["time_definition"]["years"] == list(range(2025, 2051))
    assert math.isclose(sum(m["time_definition"]["year_split"].values()), 1)


def test_units_at_the_solver_boundary():
    assert PJ_PER_GW_YEAR == pytest.approx(31.536)
    s = supply_preset("medium", "declared")
    gas = next(x for x in s["sources"] if x["key"] == "gas")
    t = techs(build_model_dict(demand_preset("medium"), s))["PWR_gas"]
    assert t["capex"] == pytest.approx(gas["capitalCost"] * 1e3)  # $/W → $M/GW
    mode = t["operating_modes"][0]
    assert mode["input_activity_ratio"]["NaturalGas"] == pytest.approx(1 / gas["efficiency"])
    assert mode["emission_activity_ratio"]["CO2"] == pytest.approx(gas["emissionFactor"] * 1e6)  # kg/J → Mt/PJ
    assert mode["opex_variable"] == pytest.approx(gas["variableCost"] * 1e9)  # $/J → $M/PJ
    assert t["residual_capacity"]["2025"] == pytest.approx(gas["capacity"][0]["power"] / 1e9)


def test_demand_is_the_dashboards_net_final_energy():
    d = demand_preset("medium")
    ds = compute_demand_series(d)
    fe = final_energy(d)
    for i, y in enumerate(ds["years"]):
        elec = sum(c["electricity"].get(y, 0) for c in fe.values())
        assert elec == pytest.approx(ds["totals"][i]["energy"], rel=1e-9)
    # the demand commodity is the useful energy: each carrier × its end-use efficiency
    es = energy_system()
    m = build_model_dict(d, supply_preset("medium", "declared"))
    tp = next(c for c in m["commodities"] if c["id"] == "TransportPrivate")
    eff = es["endUse"]["transport"]
    c = fe["TransportPrivate"]
    expected = sum(c[k][2040] * eff[k]["efficiency"] for k in ("electricity", "fuels", "gas")) / J_PER_PJ
    assert tp["demand_annual"]["ISRAEL"]["2040"] == pytest.approx(expected)
    assert math.isclose(sum(tp["demand_profile"].values()), 1)


def test_fuel_emission_factors_match_the_dashboard():
    es = energy_system()
    blends = es["fuelBlends"]
    for commodity, key in (
        ("OilProducts", "importFossil"),
        ("CleanFuel", "importClean"),
        ("Hydrogen", "hydrogenImport"),
    ):
        assert blends[commodity]["emissionFactor"] == pytest.approx(FINAL_EMISSION_FACTOR[key])
    assert es["gasEmissionFactor"] == pytest.approx(FINAL_EMISSION_FACTOR["gasDirect"])


def test_run_mode_limits():
    d, s = demand_preset("medium"), supply_preset("medium", "declared")
    by_key = {x["key"]: x for x in s["sources"]}
    capped = techs(build_model_dict(d, s, "capped"))
    # coal: its fleet until its retire year
    coal = by_key["coal"]
    res = capped["PWR_coal"]["residual_capacity"]
    assert res["2025"] == pytest.approx(coal["capacity"][0]["power"] / 1e9) and res[str(coal["retireYear"])] == 0
    # a disabled source cannot be built; an enabled one keeps its cap
    assert all(v == 0 for v in capped["PWR_nuclear"]["capacity_gross_max"].values())
    assert capped["PWR_solar"]["capacity_gross_max"]["2050"] == pytest.approx(by_key["solar"]["maxPower"] / 1e9)
    # no new build in the base year, nor before a source's earliest year
    fusion = capped["PWR_fusion"]["capacity_additional_max"]
    assert fusion["2039"] == 0 and fusion["2040"] > 0
    assert capped["PWR_solar"]["capacity_additional_max"]["2025"] == 0
    assert capped["PWR_solar"]["capacity_additional_max"]["2026"] > 0
    # LNG cannot be imported before its earliest year
    lng = capped["IMP_LNG"]["activity_annual_max"]
    assert lng["2029"] == 0 and lng["2030"] > 0
    # follow: the dashboard's curve is the minimum
    follow = techs(build_model_dict(d, s, "follow"))
    solar_2050 = next(p["power"] for p in by_key["solar"]["capacity"] if p["year"] == 2050)
    assert follow["PWR_solar"]["capacity_gross_min"]["2050"] == pytest.approx(solar_2050 / 1e9)
    # the solar profile keeps the source's yearly capacity factor
    split = energy_system()["timeslices"]
    cf = follow["PWR_solar"]["capacity_factor"]
    assert sum(cf[ts] * split[ts] for ts in cf) == pytest.approx(by_key["solar"]["capacityFactor"])


def test_end_use_fleet_starts_at_the_base_year_mix():
    d = demand_preset("medium")
    m = build_model_dict(d, supply_preset("medium", "declared"))
    t = techs(m)["USE_TransportPrivate_FUEL"]
    spec = energy_system()["endUse"]["transport"]["fuels"]
    fuels = final_energy(d)["TransportPrivate"]["fuels"][2025]
    assert t["residual_capacity"]["2025"] == pytest.approx(
        fuels * spec["efficiency"] / (spec["capacityFactor"] * SECONDS_PER_YEAR) / 1e9
    )
    assert t["residual_capacity"]["2040"] == 0  # 15-year life: retired linearly by 2040
    fixed = techs(m)["USE_ElecResidential_ELEC"]
    elec = final_energy(d)["ElecResidential"]["electricity"][2030]
    assert fixed["activity_annual_min"]["2030"] == pytest.approx(elec / J_PER_PJ)


@pytest.mark.parametrize("level", LEVELS)
@pytest.mark.parametrize("policy", POLICIES)
def test_every_preset_solves_in_every_mode(level, policy):
    from energy_model.osemosys.solve import run

    d, s = demand_preset(level), supply_preset(level, policy)
    for mode in ("free", "capped", "follow"):
        r = run(d, s, mode)
        assert r["status"] == "optimal", (mode, r)
        if mode == "follow":
            # follow keeps at least the dashboard's capacity of every enabled source
            cap = {(c["source"], c["year"]): c["power"] for c in r["capacity"]}
            for src in s["sources"]:
                if src["enabled"]:
                    for y in (2030, 2040, 2050):
                        want = source_capacity(src, y)
                        assert cap[(src["key"], y)] >= want * (1 - 1e-6) - 1e3, (src["key"], y)
        # electricity made covers electricity used by the end-use technologies, every year
        for y in r["years"]:
            made = sum(p["electricity"] for p in r["production"] if p["year"] == y)
            used = sum(e["energy"] for e in r["endUse"] if e["year"] == y and e["carrier"] == "electricity")
            assert made >= used * (1 - 1e-6), (mode, y)
        assert all(e["co2"] >= -1e3 for e in r["emissions"])
        assert r["objective"] > 0


def test_export_loads_and_solves_to_the_same_objective(tmp_path):
    from tz.osemosys import Model

    from energy_model.osemosys.build import build_model
    from energy_model.osemosys.export import export

    path = export("medium", "declared", tmp_path, "free")
    assert path.name == "israel_energy_model.yaml" and (path.parent / "README.md").exists()
    direct = build_model(demand_preset("medium"), supply_preset("medium", "declared"), "free")
    loaded = Model.from_yaml(str(path))
    assert direct.solve(solver_name="highs")[0] == "ok"
    assert loaded.solve(solver_name="highs")[0] == "ok"
    assert float(loaded.objective) == pytest.approx(float(direct.objective), rel=1e-6)
