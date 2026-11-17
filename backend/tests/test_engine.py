"""בדיקות יחידה של המנוע (חלק מהמקרים של src/model/*.test.ts); השאר מכוסה בקובצי הייחוס."""

from __future__ import annotations

import math

import pytest

from energy_model.core import js_round, linear_share, round2, round_power, round_up_power, year_range
from energy_model.demand import apply_measures, peak_from_energy, sector_energy, sector_total_energy
from energy_model.jsjson import js_number, stringify
from energy_model.plan import fuel_shares, plan_capacity, ramp_capacity
from energy_model.supply import interpolate_capacity, scale_capacity_from, set_capacity_at, source_capacity
from energy_model.units import from_gw as GW
from energy_model.units import from_twh as TWh
from energy_model.units import to_twh

SECTOR = {
    "key": "x",
    "label": "x",
    "baseEnergy": TWh(10),
    "growthRate": 0.02,
    "curve": "exp",
    "efficiencyRate": 0,
    "loadFactor": 0.5,
}


def twh(s, y):
    return to_twh(sector_energy(s, y, 2025, 2050))


def test_math():
    assert year_range(2025, 2027) == [2025, 2026, 2027]
    assert linear_share(5, 0, 10) == 0.5
    assert linear_share(12, 0, 10) == 1
    assert linear_share(3, 5, 5) == 0 and linear_share(5, 5, 5) == 1
    assert round_up_power(GW(1.2300000001)) == 1.23e9
    assert round_up_power(GW(1.231)) == 1.24e9
    assert round_power(GW(1.234)) == 1.23e9
    assert round2(0.125) == 0.13  # JavaScript rounds half up; Python's round() would give 0.12
    assert js_round(-0.5) == 0


def test_sector_curves():
    assert twh(SECTOR, 2025) == pytest.approx(10)
    assert twh({**SECTOR, "curve": "linear"}, 2035) == pytest.approx(12)
    assert twh(SECTOR, 2035) == pytest.approx(10 * 1.02**10)
    s = {**SECTOR, "curve": "s"}
    assert twh(s, 2050) == pytest.approx(10 * 1.02**25)
    assert twh(s, 2025) == pytest.approx(10)
    assert twh({**SECTOR, "efficiencyRate": 0.01}, 2026) == pytest.approx(10 * 1.02 * 0.99)
    # 8.76 TWh at a load factor of 0.5 is a 2 GW peak
    assert peak_from_energy(TWh(8.76), 0.5) == pytest.approx(GW(2))


def test_sub_sectors_sum_to_the_sector():
    subs = [
        {"key": "a", "label": "a", "elecShare": 0.3, "fuelShare": 0.5},
        {"key": "b", "label": "b", "elecShare": 0.7, "fuelShare": 0.5},
    ]
    with_subs = {**SECTOR, "subSectors": subs}
    for y in (2025, 2035, 2050):
        assert sector_total_energy(with_subs, y, 2025, 2050) == pytest.approx(
            sector_energy(SECTOR, y, 2025, 2050), rel=1e-12
        )
    faster = {**SECTOR, "subSectors": [{**subs[0], "growthRate": 0.1}, subs[1]]}
    assert sector_total_energy(faster, 2050, 2025, 2050) > sector_energy(SECTOR, 2050, 2025, 2050)


def test_measures_combine_multiplicatively():
    m = apply_measures(
        [{"year": 2050, "energy": TWh(100), "peak": GW(10)}], {"efficiency": 0.3, "saving": 0.3}, 2025, 2050
    )[0]
    assert m["netEnergy"] == pytest.approx(TWh(49))
    assert m["efficiencyEnergy"] == pytest.approx(TWh(30)) and m["savingEnergy"] == pytest.approx(TWh(21))
    assert m["netPeak"] == pytest.approx(GW(4.9))


def test_supply_helpers():
    pts = [{"year": 2025, "power": GW(1)}, {"year": 2035, "power": GW(3)}]
    assert interpolate_capacity(pts, 2020) == GW(1)
    assert interpolate_capacity(pts, 2030) == pytest.approx(GW(2))
    assert interpolate_capacity(pts, 2040) == GW(3)
    assert set_capacity_at(pts, 2030, GW(5))[1] == {"year": 2030, "power": GW(5)}
    src = {"key": "c", "enabled": True, "capacity": pts, "retireYear": 2030}
    assert source_capacity(src, 2029) == pytest.approx(GW(1.8)) and source_capacity(src, 2030) == 0
    scaled = scale_capacity_from([{"year": 2025, "power": 6e9}, {"year": 2050, "power": 20e9}], 2030, 2050, 40e9)
    assert scaled[0] == {"year": 2025, "power": 6e9} and scaled[-1] == {"year": 2050, "power": 40e9}
    assert scaled[1] == {"year": 2030, "power": 17.6e9}


def test_plan_rules():
    p = {
        "solar": {"base": GW(6), "slope": GW(1)},
        "solar30": {"start": 2030, "slope": GW(0.5)},
        "solar40": {"start": 2035, "slope": GW(0.5)},
        "importElectricity": {"start": 2030, "step": GW(1), "stepYears": 5, "steps": 4},
        "geothermal": {"start": 2035, "rate": GW(0.2), "rampYears": 10},
        "fusion": {"start": 2040, "rate": GW(0.5), "rampYears": 5},
        "cleanFuels": {"start": 2030, "share": 0.2},
        "hydrogen": {"start": 2040, "share": 0.1},
    }
    assert plan_capacity("solar", p, 2035, 2025) == GW(16)
    assert plan_capacity("solar30", p, 2029, 2025) == 0 and plan_capacity("solar30", p, 2031, 2025) == GW(1)
    assert plan_capacity("importElectricity", p, 2030, 2025) == GW(1)
    assert plan_capacity("importElectricity", p, 2060, 2025) == GW(4)
    assert ramp_capacity(p["fusion"], 2039) == 0
    assert ramp_capacity({"start": 2040, "rate": 1, "rampYears": 0}, 2042) == 3
    s = fuel_shares(2050, p, 2050)
    assert s["importClean"] == pytest.approx(0.2) and s["hydrogenImport"] == pytest.approx(0.1)
    assert math.isclose(sum(s.values()), 1)


@pytest.mark.parametrize(
    ("x", "js"),
    [
        (12.0, "12"),
        (0.5, "0.5"),
        (1e-7, "1e-7"),
        (0.00001, "0.00001"),
        (123456789012.5, "123456789012.5"),
        (1e21, "1e+21"),
        (-2.25, "-2.25"),
        (0.1 + 0.2, "0.30000000000000004"),
        (6, "6"),
        (0.0, "0"),
    ],
)
def test_js_number(x, js):
    assert js_number(x) == js


def test_stringify_matches_javascript():
    assert stringify({"a": [1.0, 2.5], "b": "שלום", "c": True, "d": None}) == '{"a":[1,2.5],"b":"שלום","c":true}'
