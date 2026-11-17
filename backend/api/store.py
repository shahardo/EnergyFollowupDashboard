"""מצב השרת: תרחישים שמורים והרצות OSeMOSYS, כקובצי JSON בתיקייה, עם מראה אופציונלית ב-dataset של Hugging Face.

למה קבצים ולא SQLite: המראה מעלה את התיקייה בזמן שהשרת רץ, וקובץ JSON שנכתב אטומית (קובץ זמני ושינוי שם)
תמיד שלם, בעוד שקובץ SQLite שמועלה באמצע כתיבה יכול להיות פגום.

מבנה התיקייה:
    scenarios/<id>.json        המעטפת של הקובץ השמור (energy-dashboard/v1) ו-meta
    runs/<id>.json             הבקשה, הסטטוס והזמנים של הרצה
    runs/<id>.result.json      התוצאה (כשהסתיימה)
    runs/<id>.log              הפלט של הפותר
"""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

log = logging.getLogger("energy.store")

_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def new_id() -> str:
    """מזהה קצר לתרחיש או להרצה."""
    return uuid.uuid4().hex[:12]


def valid_id(i: str) -> bool:
    """מזהה בטוח לשם קובץ."""
    return bool(_ID.match(i))


def now_iso() -> str:
    """הזמן הנוכחי ב-UTC, ISO 8601 עם מיקרו-שניות (כדי שהמיון לפי זמן יהיה יציב)."""
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


class HubClient(Protocol):
    """מה שהמראה צריכה מ-huggingface_hub (מוחלף בזיוף בבדיקות)."""

    def download(self, repo_id: str, local_dir: Path) -> None: ...

    def upload(self, repo_id: str, local_dir: Path, message: str) -> None: ...


class HfHubClient:
    """HubClient אמיתי: dataset פרטי ב-Hugging Face, עם טוקן מ-HF_TOKEN."""

    def __init__(self, token: str):
        from huggingface_hub import HfApi

        self.api = HfApi(token=token)
        self.token = token

    def download(self, repo_id: str, local_dir: Path) -> None:
        from huggingface_hub import snapshot_download

        self.api.create_repo(repo_id, repo_type="dataset", private=True, exist_ok=True)
        snapshot_download(repo_id, repo_type="dataset", local_dir=str(local_dir), token=self.token)

    def upload(self, repo_id: str, local_dir: Path, message: str) -> None:
        self.api.upload_folder(
            repo_id=repo_id,
            repo_type="dataset",
            folder_path=str(local_dir),
            commit_message=message,
            allow_patterns=["scenarios/*", "runs/*"],
        )


class HubSync:
    """מראה של תיקיית המצב ב-dataset: שחזור בהפעלה, דחיפה כל `every` שניות כשיש שינוי, ומיד אחרי הרצה ובסגירה."""

    def __init__(self, client: HubClient, repo_id: str, folder: Path, every: float = 300):
        self.client, self.repo_id, self.folder, self.every = client, repo_id, folder, every
        self._dirty = False
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def restore(self) -> None:
        """מוריד את המצב השמור (לפני שהשרת מתחיל לכתוב)."""
        self.client.download(self.repo_id, self.folder)

    def mark_dirty(self) -> None:
        """יש שינוי שעוד לא נדחף."""
        self._dirty = True

    def flush(self, message: str = "sync") -> bool:
        """דוחף עכשיו, אם יש שינוי. מחזיר True אם נדחף."""
        with self._lock:
            if not self._dirty:
                return False
            self._dirty = False
            try:
                self.client.upload(self.repo_id, self.folder, message)
                return True
            except Exception:  # noqa: BLE001 - a failed push is retried on the next round
                log.exception("push to %s failed", self.repo_id)
                self._dirty = True
                return False

    def start(self) -> None:
        """דחיפה תקופתית ברקע."""

        def loop() -> None:
            while not self._stop.wait(self.every):
                self.flush("periodic sync")

        self._thread = threading.Thread(target=loop, name="hub-sync", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """עוצר את הרקע ודוחף את מה שנשאר."""
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        self.flush("shutdown sync")


class Store:
    """התרחישים וההרצות בתיקייה; כל כתיבה אטומית, ומסמנת את המראה (אם יש) כמלוכלכת."""

    def __init__(self, folder: Path, sync: HubSync | None = None):
        self.folder = folder
        self.sync = sync
        (folder / "scenarios").mkdir(parents=True, exist_ok=True)
        (folder / "runs").mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    # ── כלים ──
    def _write(self, path: Path, data: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)
        if self.sync:
            self.sync.mark_dirty()

    @staticmethod
    def _read(path: Path) -> Any | None:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    # ── תרחישים ──
    def save_scenario(self, envelope: dict, scenario_id: str | None = None) -> dict:
        """שומר מעטפת של קובץ (demand / supply / projects) ומחזיר את ה-meta שלה."""
        sid = scenario_id or new_id()
        meta = {
            "id": sid,
            "kind": envelope["kind"],
            "name": envelope["data"].get("name", ""),
            "savedAt": envelope.get("savedAt") or now_iso(),
            "storedAt": now_iso(),
        }
        self._write(self.folder / "scenarios" / f"{sid}.json", {"meta": meta, "file": envelope})
        return meta

    def list_scenarios(self) -> list[dict]:
        """ה-meta של כל התרחישים, החדשים קודם."""
        rows = [self._read(p) for p in (self.folder / "scenarios").glob("*.json") if valid_id(p.stem)]
        return sorted((r["meta"] for r in rows if r), key=lambda m: m["storedAt"], reverse=True)

    def get_scenario(self, sid: str) -> dict | None:
        """המעטפת השמורה, או None."""
        row = self._read(self.folder / "scenarios" / f"{sid}.json") if valid_id(sid) else None
        return row["file"] if row else None

    def delete_scenario(self, sid: str) -> bool:
        """מוחק תרחיש. מחזיר False אם לא היה."""
        p = self.folder / "scenarios" / f"{sid}.json"
        if not valid_id(sid) or not p.exists():
            return False
        p.unlink()
        if self.sync:
            self.sync.mark_dirty()
        return True

    # ── הרצות ──
    def run_path(self, rid: str, suffix: str = ".json") -> Path:
        """הנתיב של קובץ של הרצה."""
        return self.folder / "runs" / f"{rid}{suffix}"

    def create_run(self, request: dict) -> dict:
        """הרצה חדשה בתור."""
        run = {
            "id": new_id(),
            "status": "queued",
            "createdAt": now_iso(),
            "runMode": request.get("runMode"),
            "demandSource": request.get("demandSource"),
            "request": request,
        }
        self._write(self.run_path(run["id"]), run)
        return run

    def update_run(self, rid: str, **fields: Any) -> dict | None:
        """מעדכן שדות של הרצה."""
        with self._lock:
            run = self.get_run(rid)
            if run is None:
                return None
            run.update(fields)
            self._write(self.run_path(rid), run)
            return run

    def get_run(self, rid: str) -> dict | None:
        """ההרצה, או None."""
        return self._read(self.run_path(rid)) if valid_id(rid) else None

    def list_runs(self, limit: int = 20) -> list[dict]:
        """ההרצות האחרונות (בלי הבקשה המלאה)."""
        # רק runs/<id>.json (לא התוצאות, קבצים זמניים או לוגים)
        runs = [self._read(p) for p in (self.folder / "runs").glob("*.json") if valid_id(p.stem)]
        runs = sorted((r for r in runs if r), key=lambda r: r["createdAt"], reverse=True)[:limit]
        return [{k: v for k, v in r.items() if k != "request"} for r in runs]

    def save_result(self, rid: str, result: dict) -> None:
        """התוצאה של הרצה."""
        self._write(self.run_path(rid, ".result.json"), result)

    def get_result(self, rid: str) -> dict | None:
        """התוצאה, או None."""
        return self._read(self.run_path(rid, ".result.json")) if valid_id(rid) else None

    def log_tail(self, rid: str, lines: int = 40) -> str:
        """סוף הפלט של הפותר."""
        p = self.run_path(rid, ".log")
        if not valid_id(rid) or not p.exists():
            return ""
        return "\n".join(p.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:])

    def fail_interrupted(self) -> int:
        """הרצות שנשארו בתור או באמצע מהפעלה קודמת (השרת הופעל מחדש): מסומנות כנכשלו."""
        n = 0
        for r in self.list_runs(limit=10_000):
            if r["status"] in ("queued", "running"):
                self.update_run(
                    r["id"], status="failed", error="interrupted: the server restarted", finishedAt=now_iso()
                )
                n += 1
        return n
