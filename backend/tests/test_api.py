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

    def delete(self, bucket, names):
        self.deleted = [*getattr(self, "deleted", []), *names]
        for name in names:
            (self.remote / name).unlink(missing_ok=True)


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
        assert c.post(f"/api/osemosys/runs/{second['id']}/cancel").status_code == 200
        assert c.get(f"/api/osemosys/runs/{second['id']}").json()["status"] == "cancelled"
        # a run that is still going can't be deleted
        assert c.delete(f"/api/osemosys/runs/{first['id']}").status_code == 409
        run = wait_for(c, first["id"])
        assert run["status"] == "done", run
        result = c.get(f"/api/osemosys/runs/{first['id']}/result").json()
        assert result["status"] == "optimal"
        fusion_2050 = next(x["power"] for x in result["capacity"] if x["source"] == "fusion" and x["year"] == 2050)
        assert fusion_2050 > 0
        assert "run finished" in hub.pushes  # the result was mirrored right away
        assert "Optimal" in run["log"] or "optimal" in run["log"].lower()
        assert [r["id"] for r in c.get("/api/osemosys/runs").json()] == [second["id"], first["id"]]
        # the whole log, read in steps from an offset (the page follows it live), without terminal colour codes
        log = c.get(f"/api/osemosys/runs/{first['id']}/log").json()
        assert "building the OSeMOSYS model" in log["text"] and "HiGHS" in log["text"] and "\x1b[" not in log["text"]
        assert log["status"] == "done" and log["offset"] > 0
        tail = c.get(f"/api/osemosys/runs/{first['id']}/log", params={"offset": log["offset"] - 10}).json()
        assert tail["text"] == log["text"][-10:] and tail["offset"] == log["offset"]
        assert c.get(f"/api/osemosys/runs/{first['id']}/log", params={"offset": log["offset"]}).json()["text"] == ""
        # the parameters the solver got are saved with the run
        params = c.get(f"/api/osemosys/runs/{first['id']}/parameters").json()
        assert params["system"]["runMode"] == "follow"
        assert (runs_dir := tmp_path / "state" / "runs" / f"{first['id']}.params.json").exists()
        gas = next(t for t in params["technologies"] if t["id"] == "PWR_gas")
        assert gas["capex"] > 0 and gas["operatingLife"] > 0 and gas["label"] == "גז טבעי"
        # an older run without a parameters file: computed from its request
        runs_dir.unlink()
        assert c.get(f"/api/osemosys/runs/{first['id']}/parameters").json() == params
        assert c.get("/api/osemosys/runs/nope/parameters").status_code == 404
        assert c.get("/api/osemosys/runs/nope/log").status_code == 404
    # the result is in the mirror too
    assert json.loads((tmp_path / "remote" / "runs" / f"{first['id']}.result.json").read_text())["status"] == "optimal"


def test_runs_are_renamed_and_deleted_here_and_in_the_mirror(tmp_path):
    runs = tmp_path / "state" / "runs"
    runs.mkdir(parents=True)
    for i, rid in enumerate(["old1", "old2", "old3"]):
        (runs / f"{rid}.json").write_text(
            json.dumps({"id": rid, "status": "done", "createdAt": f"2026-01-0{i + 1}", "request": {}})
        )
    for suffix in (".result.json", ".params.json"):
        (runs / f"old1{suffix}").write_text("{}")
    (runs / "old1.log").write_text("log")
    hub = FakeHub(tmp_path / "remote")
    with make_client(tmp_path, state_bucket="b", hub=hub) as c:
        assert [r["id"] for r in c.get("/api/osemosys/runs", params={"limit": 2}).json()] == ["old3", "old2"]
        assert c.get("/api/osemosys/runs", params={"limit": 0}).status_code == 422
        hub.upload("b", tmp_path / "state", "seed")  # the mirror holds every file
        assert c.patch("/api/osemosys/runs/old2", json={"name": "  base case  "}).json()["name"] == "base case"
        assert next(r for r in c.get("/api/osemosys/runs").json() if r["id"] == "old2")["name"] == "base case"
        assert "name" not in c.patch("/api/osemosys/runs/old2", json={"name": ""}).json()
        assert len(c.patch("/api/osemosys/runs/old2", json={"name": "x" * 200}).json()["name"]) == 80
        assert c.patch("/api/osemosys/runs/nope", json={"name": "a"}).status_code == 404
        assert c.delete("/api/osemosys/runs/old1").json() == {"deleted": "old1"}
        assert c.delete("/api/osemosys/runs/old1").status_code == 404
        assert c.get("/api/osemosys/runs/old1").status_code == 404
        assert not list(runs.glob("old1*"))
        assert [r["id"] for r in c.get("/api/osemosys/runs").json()] == ["old3", "old2"]
    # pushed on shutdown: the deleted files are gone from the bucket too, so a restart won't bring them back
    assert sorted(hub.deleted) == [f"runs/old1{s}" for s in (".json", ".log", ".params.json", ".result.json")]
    assert not list((tmp_path / "remote" / "runs").glob("old1*"))
    assert (tmp_path / "remote" / "runs" / "old2.json").exists()


def test_a_deleted_scenario_is_deleted_from_the_mirror(tmp_path):
    hub = FakeHub(tmp_path / "remote")
    with make_client(tmp_path, state_bucket="b", hub=hub) as c:
        sid = c.post("/api/scenarios", json=envelope()).json()["id"]
        hub.upload("b", tmp_path / "state", "seed")
        assert c.delete(f"/api/scenarios/{sid}").status_code == 200
    assert not (tmp_path / "remote" / "scenarios" / f"{sid}.json").exists()


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
    v1 = json.loads((Path(__file__).parents[2] / "src/io/fixtures/v1-supply-medium-declared.json").read_text())
    meta = client.post("/api/scenarios", json=v1).json()
    got = client.get(f"/api/scenarios/{meta['id']}").json()
    assert got["schema"] == "energy-dashboard/v2"
    solar = next(s for s in got["data"]["sources"] if s["key"] == "solar")
    preset = next(s for s in supply_preset("medium", "declared")["sources"] if s["key"] == "solar")
    assert solar["capacity"][-1]["power"] == pytest.approx(preset["capacity"][-1]["power"])
    assert solar["capitalCost"] == preset["capitalCost"]
    v1d = json.loads((Path(__file__).parents[2] / "src/io/fixtures/v1-demand-medium.json").read_text())
    meta = client.post("/api/scenarios", json=v1d).json()
    assert client.get(f"/api/scenarios/{meta['id']}").json()["data"] == demand_preset("medium")


def test_run_in_request_returns_the_finished_run(tmp_path):
    # Cloud Run: the submit request stays open until the solve ends
    with make_client(tmp_path, run_in_request=True) as c:
        run = c.post("/api/osemosys/runs", json={**pair(), "runMode": "follow"}).json()
        assert run["status"] == "done", run
        assert c.get(f"/api/osemosys/runs/{run['id']}/result").json()["status"] == "optimal"
