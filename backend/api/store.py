"""מצב השרת: תרחישים שמורים והרצות OSeMOSYS, כקובצי JSON בתיקייה, עם מראה אופציונלית ב-bucket של Google Cloud Storage.

למה קבצים ולא SQLite: המראה מעלה את התיקייה בזמן שהשרת רץ, וקובץ JSON שנכתב אטומית (קובץ זמני ושינוי שם)
תמיד שלם, בעוד שקובץ SQLite שמועלה באמצע כתיבה יכול להיות פגום.

מבנה התיקייה:
    scenarios/<id>.json        המעטפת של הקובץ השמור (energy-dashboard/v1) ו-meta
    runs/<id>.json             הבקשה, הסטטוס והזמנים של הרצה
    runs/<id>.result.json      התוצאה (כשהסתיימה)
    runs/<id>.params.json      פרמטרי המודל שהפותר קיבל (ביקוש, עלויות, אורך חיים...)
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
#: קודי צבע ותנועת סמן של הטרמינל (פסי ההתקדמות של linopy) שלא מוצגים בדפדפן.
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
#: הכי הרבה בתים של לוג בקריאה אחת.
LOG_CHUNK = 256 * 1024
#: The files of a run (runs/<id><suffix>).
RUN_SUFFIXES = (".json", ".result.json", ".log", ".params.json", ".result.tmp.json")
#: The longest run name.
RUN_NAME_MAX = 80


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
    """מה שהמראה צריכה מהאחסון (מוחלף בזיוף בבדיקות)."""

    def download(self, bucket: str, local_dir: Path) -> None: ...

    def upload(self, bucket: str, local_dir: Path, message: str) -> None: ...

    def delete(self, bucket: str, names: list[str]) -> None: ...


class GcsClient:
    """HubClient אמיתי: bucket ב-Google Cloud Storage, באותו פרויקט כמו Cloud Run (הרשאה דרך חשבון השירות של השירות,
    בלי טוקן; ל-bucket צריך roles/storage.objectAdmin, ראו deploy/cloud-run/SETUP.md)."""

    def __init__(self):
        from google.cloud import storage

        self.client = storage.Client()

    def download(self, bucket: str, local_dir: Path) -> None:
        for blob in self.client.bucket(bucket).list_blobs():
            if blob.name.endswith("/"):
                continue
            dest = local_dir / blob.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            blob.download_to_filename(str(dest))

    def upload(self, bucket: str, local_dir: Path, message: str) -> None:
        bkt = self.client.bucket(bucket)
        for pattern in ("scenarios/*", "runs/*"):
            for path in local_dir.glob(pattern):
                if path.is_file():
                    bkt.blob(f"{path.parent.name}/{path.name}").upload_from_filename(str(path))

    def delete(self, bucket: str, names: list[str]) -> None:
        """Deletes these blobs (paths relative to the state folder); ones already gone are ignored."""
        from google.api_core.exceptions import NotFound

        bkt = self.client.bucket(bucket)
        for name in names:
            try:
                bkt.blob(name).delete()
            except NotFound:
                pass


class HubSync:
    """מראה של תיקיית המצב ב-bucket: שחזור בהפעלה, דחיפה כל `every` שניות כשיש שינוי, ומיד אחרי הרצה ובסגירה."""

    def __init__(self, client: HubClient, bucket: str, folder: Path, every: float = 300):
        self.client, self.bucket, self.folder, self.every = client, bucket, folder, every
        self._dirty = False
        #: Files deleted locally (paths relative to the folder) that still have to be deleted from the bucket.
        self._deleted: set[str] = set()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def restore(self) -> None:
        """מוריד את המצב השמור (לפני שהשרת מתחיל לכתוב)."""
        self.client.download(self.bucket, self.folder)

    def mark_dirty(self) -> None:
        """יש שינוי שעוד לא נדחף."""
        self._dirty = True

    def mark_deleted(self, names: list[str]) -> None:
        """Files deleted locally: delete them from the bucket on the next push, or restore would bring them back."""
        with self._lock:
            self._deleted.update(names)
        self._dirty = True

    def flush(self, message: str = "sync") -> bool:
        """Pushes now, if anything changed (deletions first). Returns True if pushed."""
        with self._lock:
            if not self._dirty:
                return False
            self._dirty = False
            try:
                if self._deleted:
                    self.client.delete(self.bucket, sorted(self._deleted))
                    self._deleted.clear()
                self.client.upload(self.bucket, self.folder, message)
                return True
            except Exception:  # noqa: BLE001 - a failed push is retried on the next round
                log.exception("push to %s failed", self.bucket)
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
            self.sync.mark_deleted([f"scenarios/{sid}.json"])
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

    def delete_run(self, rid: str) -> bool:
        """Deletes a run and its result, log and parameters (here and, on the next push, in the bucket).
        Returns False if there was no such run."""
        if not valid_id(rid) or not self.run_path(rid).exists():
            return False
        names = []
        with self._lock:
            for suffix in RUN_SUFFIXES:
                p = self.run_path(rid, suffix)
                if p.exists():
                    p.unlink()
                    names.append(f"runs/{p.name}")
        if self.sync:
            self.sync.mark_deleted(names)
        return True

    def rename_run(self, rid: str, name: str | None) -> dict | None:
        """Gives a run a display name (trimmed to RUN_NAME_MAX; empty = no name). None if there is no such run."""
        name = (name or "").strip()[:RUN_NAME_MAX]
        with self._lock:
            run = self.get_run(rid)
            if run is None:
                return None
            if name:
                run["name"] = name
            else:
                run.pop("name", None)
            self._write(self.run_path(rid), run)
            return run

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

    def read_log(self, rid: str, offset: int = 0) -> tuple[str, int]:
        """הפלט של הפותר מהבית offset (עד LOG_CHUNK בתים), בלי קודי צבע של הטרמינל; והמיקום הבא."""
        p = self.run_path(rid, ".log")
        if not valid_id(rid) or not p.exists():
            return "", 0
        with p.open("rb") as f:
            f.seek(max(0, offset))
            data = f.read(LOG_CHUNK)
        # לא חותכים תו UTF-8 באמצע: מה שלא הושלם יגיע בקריאה הבאה
        text = data.decode("utf-8", errors="ignore")
        used = len(text.encode("utf-8"))
        return ANSI.sub("", text), max(0, offset) + used

    def save_params(self, rid: str, params: dict) -> None:
        """פרמטרי המודל של הרצה (מה שהפותר קיבל)."""
        self._write(self.run_path(rid, ".params.json"), params)

    def get_params(self, rid: str) -> dict | None:
        """פרמטרי המודל של הרצה, או None."""
        return self._read(self.run_path(rid, ".params.json")) if valid_id(rid) else None

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
