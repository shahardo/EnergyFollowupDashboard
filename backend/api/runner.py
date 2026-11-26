"""מריץ פתרונות OSeMOSYS ברקע: תור, עד MAX_ACTIVE_RUNS תהליכים במקביל, ביטול והגבלת זמן.

כל הרצה היא תהליך נפרד (multiprocessing, spawn), כך שאפשר לעצור אותה, והפלט של HiGHS (שנכתב מ-C ישר
ל-stdout) נאסף לקובץ הלוג שלה.
"""

from __future__ import annotations

import logging
import multiprocessing as mp
import os
import sys
import threading
import time
import traceback
from collections import deque
from pathlib import Path

from .store import Store, now_iso

log = logging.getLogger("energy.runner")

#: שניות מעבר להגבלת הזמן של הפותר עד שהתהליך נעצר בכוח.
KILL_GRACE = 60


def _child(request: dict, log_path: str, result_path: str, time_limit: float) -> None:
    """בתהליך הילד: מפנה את הפלט לקובץ, פותר, וכותב את התוצאה (או את השגיאה) כ-JSON.

    הפלט מופנה עם os.dup2 כדי לאסוף גם פלט C ישיר (HiGHS). על Windows לפעמים ה-handle של
    stdout/stderr נפסל בסיום התהליך (אות שגיאה גנרי של ה-OS, לא קשור למודל) ואז הדפסה רגילה
    (traceback.print_exc) יכולה להיכשל בעצמה ולמחוק את השגיאה האמיתית - לכן ה-traceback נלכד
    כמחרוזת ונכתב לקובץ התוצאה בלי תלות ב-stdout/stderr.
    """
    import json

    fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    os.dup2(fd, 1)
    os.dup2(fd, 2)
    # שורה-שורה, כך שהלוג מתעדכן בזמן אמת (ברירת המחדל לקובץ היא חציצה בבלוקים)
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    os.close(fd)
    try:
        from energy_model.osemosys.solve import run

        result = run(
            request.get("demand"),
            request.get("supply"),
            request.get("runMode", "free"),
            time_limit=time_limit,
        )
    except Exception as e:  # noqa: BLE001 - reported to the user as the run's error
        tb = traceback.format_exc()
        try:
            sys.stderr.write(tb)
        except OSError:
            pass
        result = {"status": "failed", "error": f"{type(e).__name__}: {e}\n{tb}"}
    tmp = result_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(result, f)
    os.replace(tmp, result_path)


class Runner:
    """תור ההרצות ותהליכי הפתרון."""

    def __init__(self, store: Store, max_active: int = 1, time_limit: float = 1800, on_finish=None):
        self.store = store
        self.max_active = max(1, max_active)
        self.time_limit = time_limit
        self.on_finish = on_finish  # נקרא אחרי כל הרצה שהסתיימה (למשל דחיפה למראה)
        self._queue: deque[str] = deque()
        self._active: dict[str, tuple[mp.Process, float]] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._ctx = mp.get_context("spawn")
        self._thread = threading.Thread(target=self._loop, name="runner", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5)
        with self._lock:
            for rid, (proc, _t) in list(self._active.items()):
                proc.terminate()
                self.store.update_run(
                    rid, status="failed", error="interrupted: the server stopped", finishedAt=now_iso()
                )

    def submit(self, request: dict) -> dict:
        """מוסיף הרצה לתור."""
        run = self.store.create_run(request)
        with self._lock:
            self._queue.append(run["id"])
        return run

    def queue_position(self, rid: str) -> int | None:
        """המקום בתור (0 = הבאה), או None אם לא בתור."""
        with self._lock:
            return list(self._queue).index(rid) if rid in self._queue else None

    def cancel(self, rid: str) -> bool:
        """מבטל הרצה בתור או רצה. מחזיר False אם היא כבר הסתיימה או לא קיימת."""
        with self._lock:
            if rid in self._queue:
                self._queue.remove(rid)
            elif rid in self._active:
                self._active.pop(rid)[0].terminate()
            else:
                return False
        self.store.update_run(rid, status="cancelled", finishedAt=now_iso())
        return True

    def _start_next(self) -> None:
        rid = self._queue.popleft()
        run = self.store.get_run(rid)
        if run is None:
            return
        log_path = self.store.run_path(rid, ".log")
        result_path = self.store.run_path(rid, ".result.tmp.json")
        Path(log_path).write_text("", encoding="utf-8")
        proc = self._ctx.Process(
            target=_child, args=(run["request"], str(log_path), str(result_path), self.time_limit), daemon=True
        )
        proc.start()
        self._active[rid] = (proc, time.monotonic())
        self.store.update_run(rid, status="running", startedAt=now_iso())

    def _finish(self, rid: str, proc: mp.Process, timed_out: bool) -> None:
        import json

        tmp = self.store.run_path(rid, ".result.tmp.json")
        if timed_out:
            self.store.update_run(rid, status="failed", error="time limit exceeded", finishedAt=now_iso())
        elif tmp.exists():
            result = json.loads(tmp.read_text(encoding="utf-8"))
            tmp.unlink()
            if result.get("status") == "optimal":
                self.store.save_result(rid, result)
                self.store.update_run(rid, status="done", seconds=result.get("seconds"), finishedAt=now_iso())
            else:
                err = result.get("error") or f"solver: {result.get('termination')}"
                self.store.update_run(rid, status="failed", error=err, finishedAt=now_iso())
        else:
            self.store.update_run(
                rid, status="failed", error=f"solver process exited ({proc.exitcode})", finishedAt=now_iso()
            )
        if self.on_finish:
            try:
                self.on_finish(rid)
            except Exception:  # noqa: BLE001
                log.exception("on_finish failed")

    def _loop(self) -> None:
        while not self._stop.wait(0.5):
            with self._lock:
                for rid, (proc, started) in list(self._active.items()):
                    timed_out = proc.is_alive() and time.monotonic() - started > self.time_limit + KILL_GRACE
                    if timed_out:
                        proc.terminate()
                    if not proc.is_alive() or timed_out:
                        proc.join(timeout=5)
                        self._active.pop(rid)
                        self._finish(rid, proc, timed_out)
                while self._queue and len(self._active) < self.max_active:
                    self._start_next()
