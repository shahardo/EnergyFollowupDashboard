"""ההכנה ל-Google Cloud Run: ה-Dockerfile שלם ומאזין ל-$PORT, מה שנשלח לבנייה מצומצם, וה-workflow מגדיר את השירות."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def dockerfile() -> str:
    return (ROOT / "Dockerfile").read_text(encoding="utf-8")


def test_every_copy_source_exists():
    for line in dockerfile().splitlines():
        if line.startswith("COPY ") and "--from=" not in line:
            for src in line.split()[1:-1]:
                assert (ROOT / src).exists(), src


def test_the_image_listens_on_port():
    text = dockerfile()
    cmd = next(line for line in text.splitlines() if line.startswith("CMD "))
    assert '--port "$PORT"' in cmd and cmd.startswith("CMD exec ")  # shell form; exec passes SIGTERM to uvicorn
    assert "PORT=7860" in text  # the default when nothing sets it


def test_build_uploads_leave_local_files_out():
    for name in (".dockerignore", ".gcloudignore"):
        lines = set((ROOT / name).read_text(encoding="utf-8").splitlines())
        for needed in ("node_modules", "dist", "**/.venv", "**/__pycache__", "backend/var"):
            assert needed in lines, (name, needed)
    # nothing the Dockerfile copies is ignored
    ignored = set((ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines())
    for line in dockerfile().splitlines():
        if line.startswith("COPY ") and "--from=" not in line:
            for src in line.split()[1:-1]:
                assert src not in ignored, src


def test_cloud_run_workflow():
    wf = yaml.safe_load((ROOT / ".github" / "workflows" / "deploy-cloud-run.yml").read_text(encoding="utf-8"))
    steps = wf["jobs"]["deploy"]["steps"]
    deploy = next(s["run"] for s in steps if s.get("name") == "deploy")
    for flag in ("--source .", "--max-instances 1", "--min-instances 0", "--timeout 3600", "RUN_IN_REQUEST=1"):
        assert flag in deploy, flag
    assert "HF_TOKEN=hf-token:latest" in deploy and "RUN_TOKEN=run-token:latest" in deploy
    assert wf["permissions"]["id-token"] == "write"  # Workload Identity Federation, no stored key
    assert "vars.GCP_PROJECT" in wf["jobs"]["deploy"]["if"]
