"""ההכנה ל-Hugging Face Space: כרטיס ה-Space תקין, והקשר הבנייה שלם (בלי קובצי בדיקה ובלי סביבות מקומיות)."""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def load_deploy():
    spec = importlib.util.spec_from_file_location("deploy_hf_space", ROOT / "scripts" / "deploy_hf_space.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_space_card_front_matter():
    text = (ROOT / "deploy" / "hf-space" / "README.md").read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    assert m, "the Space card must start with YAML front matter"
    meta = yaml.safe_load(m.group(1))
    assert meta["sdk"] == "docker"
    # the port the Space routes to is the one the image listens on
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert f"EXPOSE {meta['app_port']}" in dockerfile
    assert f'"--port", "{meta["app_port"]}"' in dockerfile
    assert len(meta["short_description"]) <= 60


def test_build_context_is_complete(tmp_path):
    files = set(load_deploy().assemble(tmp_path))
    for needed in (
        "Dockerfile",
        "README.md",
        "package-lock.json",
        "src/main.tsx",
        "src/data/catalog.json",
        "backend/pyproject.toml",
        "backend/api/main.py",
        "backend/energy_model/osemosys/data/israel_energy_model.yaml",
        "backend/energy_model/osemosys/additions.yaml",
        "backend/tests/zod-schema.json",
    ):
        assert needed in files, needed
    assert not [f for f in files if f.endswith(".test.ts") or "/.venv/" in f or "__pycache__" in f]
    # every COPY source in the Dockerfile is in the context
    for line in (ROOT / "Dockerfile").read_text(encoding="utf-8").splitlines():
        if line.startswith("COPY ") and "--from=" not in line:
            for src in line.split()[1:-1]:
                assert (tmp_path / src).exists(), src
