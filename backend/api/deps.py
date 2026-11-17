"""הגדרות השרת (ממשתני סביבה) והתלויות המשותפות לנתיבים: החנות, המריץ והרשאת הכתיבה."""

from __future__ import annotations

import hmac
import os
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import Header, HTTPException, Request

ROOT = Path(__file__).resolve().parents[2]


@dataclass
class Settings:
    """משתני הסביבה של השרת."""

    #: תיקיית המצב (תרחישים והרצות).
    state_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("STATE_DIR", ROOT / "backend" / "var" / "state"))
    )
    #: dataset ב-Hugging Face שמשמש מראה למצב (למשל user/energy-dashboard-data); בלי HF_TOKEN אין מראה.
    state_repo: str | None = field(default_factory=lambda: os.environ.get("STATE_REPO") or None)
    hf_token: str | None = field(default_factory=lambda: os.environ.get("HF_TOKEN") or None)
    #: כל כמה שניות המראה נדחפת כשיש שינוי.
    sync_every: float = field(default_factory=lambda: float(os.environ.get("SYNC_EVERY", "300")))
    #: מספר הרצות OSeMOSYS במקביל.
    max_active_runs: int = field(default_factory=lambda: int(os.environ.get("MAX_ACTIVE_RUNS", "1")))
    #: הגבלת הזמן של פתרון (שניות).
    run_time_limit: float = field(default_factory=lambda: float(os.environ.get("RUN_TIME_LIMIT", "1800")))
    #: אם מוגדר: הרצה, שמירה ומחיקה בשרת דורשות את הטוקן הזה בכותרת X-Run-Token.
    run_token: str | None = field(default_factory=lambda: os.environ.get("RUN_TOKEN") or None)
    #: תיקיית האתר הבנוי (dist); אם קיימת, מוגשת ב-/.
    dist_dir: Path = field(default_factory=lambda: Path(os.environ.get("DIST_DIR", ROOT / "dist")))
    #: מקורות נוספים שמותר להם לקרוא ל-API מהדפדפן (מופרדים בפסיקים).
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip()
            for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173,https://shahardo.github.io").split(",")
            if o.strip()
        ]
    )


def require_token(request: Request, x_run_token: str | None = Header(default=None)) -> None:
    """הרשאת כתיבה: כשמוגדר RUN_TOKEN, הכותרת X-Run-Token חייבת להתאים לו."""
    expected = request.app.state.settings.run_token
    if expected and not (x_run_token and hmac.compare_digest(x_run_token, expected)):
        raise HTTPException(status_code=401, detail="run token required")
