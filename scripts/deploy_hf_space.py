"""Deploy the app to a Hugging Face Docker Space.

Assembles a self-contained Docker build context (the Dockerfile, the dashboard sources, the Python backend and
the Space card) in a temporary folder and uploads it to the Space, which then builds and restarts.

Usage:
    python scripts/deploy_hf_space.py --space <user>/<space>      # needs HF_TOKEN with write access to the Space
    python scripts/deploy_hf_space.py --out build/hf-space         # only assemble (e.g. to `docker build` it)

The GitHub workflow .github/workflows/deploy-hf-space.yml runs it on every push to main.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

#: files and folders of the build context (relative to the repo root)
CONTEXT = [
    "Dockerfile",
    ".dockerignore",
    "package.json",
    "package-lock.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "postcss.config.cjs",
    "public",
    "src",
    "backend/pyproject.toml",
    "backend/energy_model",
    "backend/api",
    "backend/tests/zod-schema.json",
]
IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".venv", "*.test.ts")


def assemble(out: Path) -> list[str]:
    """Copies the build context into out and returns its files (relative paths)."""
    for rel in CONTEXT:
        src, dst = ROOT / rel, out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst, ignore=IGNORE, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)
    # the Space card becomes the Space's README (its front matter configures the Space)
    shutil.copy2(ROOT / "deploy" / "hf-space" / "README.md", out / "README.md")
    return sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--space", default=os.environ.get("HF_SPACE"), help="<user>/<space> (or env HF_SPACE)")
    ap.add_argument("--out", type=Path, help="assemble into this folder and stop (no upload)")
    args = ap.parse_args()

    if args.out:
        if args.out.exists():
            shutil.rmtree(args.out)
        files = assemble(args.out)
        print(f"assembled {len(files)} files into {args.out}")
        return 0

    if not args.space:
        print("no Space given (--space or HF_SPACE)", file=sys.stderr)
        return 2
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("HF_TOKEN is not set", file=sys.stderr)
        return 2
    from huggingface_hub import HfApi

    api = HfApi(token=token)
    sha = os.environ.get("GITHUB_SHA", "local")[:7]
    with tempfile.TemporaryDirectory() as tmp:
        files = assemble(Path(tmp))
        api.upload_folder(
            repo_id=args.space,
            repo_type="space",
            folder_path=tmp,
            commit_message=f"Deploy {sha}",
            # files that are no longer in the context are removed from the Space
            delete_patterns=["*"],
        )
    print(f"uploaded {len(files)} files to https://huggingface.co/spaces/{args.space}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
