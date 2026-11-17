"""JSON בדיוק כמו JSON.stringify של JavaScript (בלי רווחים), כדי שקבצים שנכתבים מ-Python יהיו זהים עד הבית.

ההבדל העיקרי מ-json.dumps: מספרים. ב-JavaScript ‏12.0 נכתב "12", ‏0.00001 נכתב "0.00001" ו-1e-7 נכתב "1e-7".
"""

from __future__ import annotations

import json
import math
from decimal import Decimal
from typing import Any


def js_number(x: float | int) -> str:
    """Number.prototype.toString של JavaScript (ECMAScript Number::toString, בסיס 10)."""
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, int):
        x = float(x) if abs(x) >= 2**53 else x
        if isinstance(x, int):
            return str(x)
    if math.isnan(x) or math.isinf(x):
        return "null"
    if x == 0:
        return "0"
    if x < 0:
        return "-" + js_number(-x)
    # repr נותן את הייצוג הקצר ביותר שחוזר לאותו מספר, כמו JavaScript; רק הפורמט שונה.
    sign, digits, exp = Decimal(repr(x)).normalize().as_tuple()
    s = "".join(str(d) for d in digits)
    k = len(s)
    n = exp + k  # מיקום הנקודה העשרונית
    if k <= n <= 21:
        return s + "0" * (n - k)
    if 0 < n <= 21:
        return s[:n] + "." + s[n:]
    if -6 < n <= 0:
        return "0." + "0" * (-n) + s
    e = n - 1
    mant = s[0] + ("." + s[1:] if k > 1 else "")
    return f"{mant}e{'+' if e >= 0 else '-'}{abs(e)}"


def stringify(v: Any) -> str:
    """JSON.stringify(v) של JavaScript, בלי רווחים."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return js_number(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(stringify(x) for x in v) + "]"
    if isinstance(v, dict):
        return (
            "{"
            + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{stringify(x)}" for k, x in v.items() if x is not None)
            + "}"
        )
    raise TypeError(type(v))
