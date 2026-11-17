"""בדיקות יחידה של המנוע (חלק מהמקרים של src/model/*.test.ts); השאר מכוסה בקובצי הייחוס."""

from __future__ import annotations

import math

import pytest

from energy_model.core import js_round, linear_share, round2, round_up2, year_range
from energy_model.demand import apply_measures, peak_from_energy, sector_total_twh, sector_twh
from energy_model.jsjson import js_number, stringify
from energy_model.plan import fuel_shares, plan_capacity, ramp_capacity
from energy_model.supply import interpolate_capacity, scale_capacity_from, set_capacity_at, source_capacity

SECTOR = {
    "key": "x",
    "label": "x",
    "baseTWh": 10,
    "growthPct": 2,
    "curve": "exp",
    "efficiencyPct": 0,
    "loadFactor": 0.5,
}


def test_math():
    assert year_range(2025, 2027) == [2025, 2026, 2027]
    assert linear_share(5, 0, 10) == 0.5
    assert linear_share(12, 0, 10) == 1
    assert linear_share(3, 5, 5) == 0 and linear_share(5, 5, 5) == 1
    assert round_up2(1.2300000001) == 1.23
    assert round_up2(1.231) == 1.24
    assert round2(0.125) == 0.13  # JavaScript rounds half up; Python's round() would give 0.12
    assert js_round(-0.5) == 0


def test_sector_curves():
    assert sector_twh(SECTOR, 2025, 2025, 2050) == 10
    assert sector_twh({**SECTOR, "curve": "linear"}, 2035, 2025, 2050) == pytest.approx(12)
    assert sector_twh(SECTOR, 2035, 2025, 2050) == pytest.approx(10 * 1.02**10)
    s = {**SECTOR, "curve": "s"}
    assert sector_twh(s, 2050, 2025, 2050) == pytest.approx(10 * 1.02**25)
    assert sector_twh(s, 2025, 2025, 2050) == pytest.approx(10)
    assert sector_twh({**SECTOR, "efficiencyPct": 1}, 2026, 2025, 2050) == pytest.approx(10 * 1.02 * 0.99)
    assert peak_from_energy(8.76, 0.5) == pytest.approx(2)


def test_sub_sectors_sum_to_the_sector():
    subs = [
        {"key": "a", "label": "a", "elecShare": 0.3, "fuelShare": 0.5},
        {"key": "b", "label": "b", "elecShare": 0.7, "fuelShare": 0.5},
    ]
    with_subs = {**SECTOR, "subSectors": subs}
    for y in (2025, 2035, 2050):
        assert sector_total_twh(with_subs, y, 2025, 2050) == pytest.approx(sector_twh(SECTOR, y, 2025, 2050), rel=1e-12)
    faster = {**SECTOR, "subSectors": [{**subs[0], "growthPct": 10}, subs[1]]}
    assert sector_total_twh(faster, 2050, 2025, 2050) > sector_twh(SECTOR, 2050, 2025, 2050)


def test_measures_combine_multiplicatively():
    m = apply_measures([{"year": 2050, "twh": 100, "peakGW": 10}], {"efficiencyPct": 30, "savingPct": 30}, 2025, 2050)[
        0
    ]
    assert m["netTWh"] == pytest.approx(49)
    assert m["efficiencyTWh"] == pytest.approx(30) and m["savingTWh"] == pytest.approx(21)
    assert m["netPeakGW"] == pytest.approx(4.9)


def test_supply_helpers():
    pts = [{"year": 2025, "gw": 1}, {"year": 2035, "gw": 3}]
    assert interpolate_capacity(pts, 2020) == 1
    assert interpolate_capacity(pts, 2030) == 2
    assert interpolate_capacity(pts, 2040) == 3
    assert set_capacity_at(pts, 2030, 5)[1] == {"year": 2030, "gw": 5}
    src = {"key": "c", "enabled": True, "capacityGW": pts, "retireYear": 2030}
    assert source_capacity(src, 2029) == pytest.approx(1.8) and source_capacity(src, 2030) == 0
    scaled = scale_capacity_from([{"year": 2025, "gw": 6}, {"year": 2050, "gw": 20}], 2030, 2050, 40)
    assert scaled[0] == {"year": 2025, "gw": 6} and scaled[-1] == {"year": 2050, "gw": 40}
    assert scaled[1]["year"] == 2030 and scaled[1]["gw"] == pytest.approx(round2(8.8 * 2))


def test_plan_rules():
    p = {
        "solar": {"baseGW": 6, "slopeGW": 1},
        "solar30": {"start": 2030, "slopeGW": 0.5},
        "solar40": {"start": 2035, "slopeGW": 0.5},
        "importElectricity": {"start": 2030, "stepGW": 1, "stepYears": 5, "steps": 4},
        "geothermal": {"start": 2035, "rateGW": 0.2, "rampYears": 10},
        "fusion": {"start": 2040, "rateGW": 0.5, "rampYears": 5},
        "cleanFuels": {"start": 2030, "sharePct": 20},
        "hydrogen": {"start": 2040, "sharePct": 10},
    }
    assert plan_capacity("solar", p, 2035, 2025) == 16
    assert plan_capacity("solar30", p, 2029, 2025) == 0 and plan_capacity("solar30", p, 2031, 2025) == 1
    assert plan_capacity("importElectricity", p, 2030, 2025) == 1
    assert plan_capacity("importElectricity", p, 2060, 2025) == 4
    assert ramp_capacity(p["fusion"], 2039) == 0
    assert ramp_capacity({"start": 2040, "rateGW": 1, "rampYears": 0}, 2042) == 3
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
