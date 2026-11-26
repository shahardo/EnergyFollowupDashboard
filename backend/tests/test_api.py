"""ה-API: חישובים, תרחישים שמורים, הרשאה, מראה ה-bucket (עם לקוח מזויף) והרצת OSeMOSYS ברקע."""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.deps import Settings
from api.main import create_app
from energy_model.data import demand_preset, supply_preset
from energy_model.supply import compute_demand_series, compute_series

from .test_goldens import assert_close


class FakeHub:
    """במקום GCS: 'bucket' שהוא תיקייה, ורשימה של הדחיפות."""

    def __init__(self, remote: Path):
        self.remote = remote
        self.pushes: list[str] = []

    def download(self, bucket, local_dir):
        if self.remote.exists():
            shutil.copytree(self.remote, local_dir, dirs_exist_ok=True)

    def upload(self, bucket, local_dir, message):
        self.pushes.append(message)
        shutil.copytree(local_dir, self.remote, dirs_exist_ok=True)


def make_client(tmp_path: Path, hub: FakeHub | None = None, **kw) -> TestClient:
    settings = Settings(state_dir=tmp_path / "state", dist_dir=tmp_path / "no-dist", **kw)
    return TestClient(create_app(settings, hub))


@pytest.fixture
def client(tmp_path):
    with make_client(tmp_path) as c:
        yield c


def pair(level="medium", policy="declared"):
    return {"demand": demand_preset(level), "supply": supply_preset(level, policy)}


def envelope(kind="demand"):
    data = demand_preset("low") if kind == "demand" else supply_preset("low", "tested")
    return {"schema": "energy-dashboard/v2", "kind": kind, "savedAt": "2026-11-17T00:00:00.000Z", "data": data}


def test_health(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["osemosys"]["solver"] == "highs" and h["tokenRequired"] is False


def test_series_matches_the_engine(client):
    p = pair()
    r = client.post("/api/series", json=p)
    assert r.status_code == 200
    assert_close(r.json(), compute_series(compute_demand_series(p["demand"]), p["supply"]))


def test_compute_endpoints(client):
    p = pair("high", "tested")
    assert client.post("/api/plan-supply", json=p).json()["electricKeys"][0] == "solar"
    adj = client.post("/api/auto-adjust", json=p).json()
    assert set(adj) == {"scenario", "added", "removed", "factors"}
    rules = client.post("/api/apply-plan-rules", json=p).json()
    assert [s["key"] for s in rules["sources"]] == [s["key"] for s in p["supply"]["sources"]]
    scores = {"other": {"security": 5, "affordability": 5, "sustainability": 5, "feasibility": 0.5}}
    opts = {
        "weights": {"sustainability": 70, "affordability": 10, "security": 10, "feasibility": 10},
        "minFeasibility": 0.2,
        "retireBelow": 5,
        "retireByYear": 2040,
        "maxPower": {"solar": 90e9},
    }
    ideal = client.post("/api/ideal-supply", json={**p, "scores": scores, "options": opts}).json()
    assert ideal["ranking"] and "shortfall" in ideal


def test_invalid_input_is_rejected(client):
    bad = pair()
    bad["demand"] = {**bad["demand"], "horizonYear": 2000}
    assert client.post("/api/series", json=bad).status_code == 422


def test_scenarios_crud(client):
    meta = client.post("/api/scenarios", json=envelope()).json()
    assert meta["kind"] == "demand" and meta["name"] == demand_preset("low")["name"]
    sup = client.post("/api/scenarios", json=envelope("supply")).json()
    ids = [m["id"] for m in client.get("/api/scenarios").json()]
    assert set(ids) == {meta["id"], sup["id"]}
    got = client.get(f"/api/scenarios/{meta['id']}").json()
    assert got["kind"] == "demand" and got["data"]["sectors"][0]["key"] == "residential"
    changed = envelope()
    changed["data"]["name"] = "שלי"
    assert client.put(f"/api/scenarios/{meta['id']}", json=changed).json()["name"] == "שלי"
    assert client.delete(f"/api/scenarios/{meta['id']}").status_code == 200
    assert client.get(f"/api/scenarios/{meta['id']}").status_code == 404
    assert client.get("/api/scenarios/../../etc").status_code == 404


def test_writes_need_the_token_when_set(tmp_path):
    with make_client(tmp_path, run_token="s3cret") as c:
        assert c.get("/api/health").json()["tokenRequired"] is True
        assert c.post("/api/scenarios", json=envelope()).status_code == 401
        assert c.post("/api/scenarios", json=envelope(), headers={"X-Run-Token": "nope"}).status_code == 401
        assert c.post("/api/scenarios", json=envelope(), headers={"X-Run-Token": "s3cret"}).status_code == 200
        assert c.post("/api/osemosys/runs", json=pair()).status_code == 401
        # reading stays open
        assert c.get("/api/scenarios").status_code == 200


def test_state_survives_a_restart_through_the_bucket_mirror(tmp_path):
    remote = tmp_path / "remote"
    hub = FakeHub(remote)
    with make_client(tmp_path / "a", state_bucket="my-bucket", hub=hub) as c:
        sid = c.post("/api/scenarios", json=envelope()).json()["id"]
    assert hub.pushes == ["shutdown sync"]  # pushed when the server stopped
    # a new container: empty disk, restored from the mirror
    with make_client(tmp_path / "b", state_bucket="my-bucket", hub=hub) as c:
        assert [m["id"] for m in c.get("/api/scenarios").json()] == [sid]
        assert c.get(f"/api/scenarios/{sid}").json()["kind"] == "demand"


def wait_for(c: TestClient, rid: str, timeout: float = 300) -> dict:
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        run = c.get(f"/api/osemosys/runs/{rid}").json()
        if run["status"] not in ("queued", "running"):
            return run
        time.sleep(1)
    raise AssertionError(f"run {rid} did not finish")


def test_osemosys_run_in_the_background_and_cancel(tmp_path):
    hub = FakeHub(tmp_path / "remote")
    with make_client(tmp_path, state_bucket="my-bucket", hub=hub) as c:
        info = c.get("/api/osemosys/model").json()
        assert "PWR_fusion" in {t["id"] for t in info["technologies"]}
        first = c.post("/api/osemosys/runs", json={**pair(), "runMode": "follow"}).json()
        assert first["status"] == "queued"
        second = c.post("/api/osemosys/runs", json=pair()).json()
        time.sleep(1.5)
        # one run at a time: the second waits in the queue, and can be cancelled there
        assert c.get(f"/api/osemosys/runs/{second['id']}").json()["queuePosition"] == 0
        assert c.delete(f"/api/osemosys/runs/{second['id']}").status_code == 200
        assert c.get(f"/api/osemosys/runs/{second['id']}").json()["status"] == "cancelled"
        run = wait_for(c, first["id"])
        assert run["status"] == "done", run
        result = c.get(f"/api/osemosys/runs/{first['id']}/result").json()
        assert result["status"] == "optimal"
        fusion_2050 = next(x["power"] for x in result["capacity"] if x["source"] == "fusion" and x["year"] == 2050)
        assert fusion_2050 > 0
        assert "run finished" in hub.pushes  # the result was mirrored right away
        assert "Optimal" in run["log"] or "optimal" in run["log"].lower()
        assert [r["id"] for r in c.get("/api/osemosys/runs").json()] == [second["id"], first["id"]]
    # the result is in the mirror too
    assert (
        json.loads((tmp_path / "remote" / "runs" / f"{first['id']}.result.json").read_text(encoding="utf-8"))["status"]
        == "optimal"
    )


def test_interrupted_runs_are_marked_failed_on_start(tmp_path):
    runs = tmp_path / "state" / "runs"
    runs.mkdir(parents=True)
    (runs / "abc123.json").write_text(
        json.dumps({"id": "abc123", "status": "running", "createdAt": "x", "request": {}})
    )
    with make_client(tmp_path) as c:
        run = c.get("/api/osemosys/runs/abc123").json()
        assert run["status"] == "failed" and "restart" in run["error"]


def test_a_v1_file_is_converted_to_si_on_save(client):
    v1 = json.loads(
        (Path(__file__).parents[2] / "src/io/fixtures/v1-supply-medium-declared.json").read_text(encoding="utf-8")
    )
    meta = client.post("/api/scenarios", json=v1).json()
    got = client.get(f"/api/scenarios/{meta['id']}").json()
    assert got["schema"] == "energy-dashboard/v2"
    solar = next(s for s in got["data"]["sources"] if s["key"] == "solar")
    preset = next(s for s in supply_preset("medium", "declared")["sources"] if s["key"] == "solar")
    assert solar["capacity"][-1]["power"] == pytest.approx(preset["capacity"][-1]["power"])
    assert solar["capitalCost"] == preset["capitalCost"]
    v1d = json.loads((Path(__file__).parents[2] / "src/io/fixtures/v1-demand-medium.json").read_text(encoding="utf-8"))
    meta = client.post("/api/scenarios", json=v1d).json()
    assert client.get(f"/api/scenarios/{meta['id']}").json()["data"] == demand_preset("medium")


def test_run_in_request_returns_the_finished_run(tmp_path):
    # Cloud Run: the submit request stays open until the solve ends
    with make_client(tmp_path, run_in_request=True) as c:
        run = c.post("/api/osemosys/runs", json={**pair(), "runMode": "follow"}).json()
        assert run["status"] == "done", run
        assert c.get(f"/api/osemosys/runs/{run['id']}/result").json()["status"] == "optimal"
