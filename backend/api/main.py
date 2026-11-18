"""השרת: FastAPI עם ה-API ב-/api, והאתר הבנוי (dist) ב-/ כשהוא קיים.

הרצה מקומית: uvicorn api.main:app --reload (מתוך backend/), או npm run api.
בקונטיינר (Dockerfile, Google Cloud Run): אותה אפליקציה על הפורט שב-$PORT (ברירת מחדל 7860).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .deps import Settings
from .routes import compute, osemosys, scenarios
from .runner import Runner
from .store import HfHubClient, HubSync, Store

log = logging.getLogger("energy")
VERSION = "0.1.0"


def create_app(settings: Settings | None = None, hub_client=None) -> FastAPI:
    """בונה את האפליקציה. hub_client: תחליף ל-huggingface_hub בבדיקות."""
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        sync = None
        if settings.state_repo and (settings.hf_token or hub_client):
            client = hub_client or HfHubClient(settings.hf_token)
            sync = HubSync(client, settings.state_repo, settings.state_dir, settings.sync_every)
            settings.state_dir.mkdir(parents=True, exist_ok=True)
            try:
                sync.restore()
            except Exception:  # noqa: BLE001 - start empty rather than not at all
                log.exception("could not restore state from %s", settings.state_repo)
        store = Store(settings.state_dir, sync)
        interrupted = store.fail_interrupted()
        if interrupted:
            log.warning("%d runs were interrupted by a restart", interrupted)
        runner = Runner(
            store,
            settings.max_active_runs,
            settings.run_time_limit,
            on_finish=(lambda _rid: sync.flush("run finished")) if sync else None,
        )
        app.state.settings, app.state.store, app.state.runner, app.state.sync = settings, store, runner, sync
        if sync:
            sync.start()
        runner.start()
        yield
        runner.stop()
        if sync:
            sync.stop()

    app = FastAPI(title="Energy dashboard API", version=VERSION, lifespan=lifespan)
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", tags=["meta"])
    def health() -> dict:
        """השרת חי; גרסה, המודל, והאם יש מראה ואם נדרש טוקן."""
        return {
            "status": "ok",
            "version": VERSION,
            "osemosys": {"model": "generated from the dashboard data", "solver": "highs"},
            "stateMirror": bool(app.state.sync) if hasattr(app.state, "sync") else False,
            "tokenRequired": bool(settings.run_token),
            "maxActiveRuns": settings.max_active_runs,
        }

    app.include_router(compute.router)
    app.include_router(scenarios.router)
    app.include_router(osemosys.router)

    # האתר הבנוי: הקבצים ב-/assets, וכל השאר מחזיר את index.html (HashRouter, אז זה רק לשורש).
    dist = settings.dist_dir
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/", include_in_schema=False)
        def index() -> FileResponse:
            return FileResponse(dist / "index.html")

    return app


app = create_app()
