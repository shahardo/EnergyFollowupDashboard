/** רצועה בגרף: בין גבול תחתון לעליון בכל שנה (ערכי הנתונים, אחרי הערימה). */
export interface HoverBand {
  seriesIndex: number;
  lower: number[];
  upper: number[];
}

/** קו בגרף (ביקוש, השוואה): ערך לכל שנה, null = אין. */
export interface HoverLine {
  seriesIndex: number;
  values: (number | null)[];
}

/** ערך בשבר אינדקס f, בקו ישר בין שתי השנים הסמוכות (כמו שהגרף מצייר). null אם אחד הקצוות חסר. */
function lerpAt(values: (number | null)[], f: number): number | null {
  if (values.length === 0) return null;
  const i = Math.max(0, Math.min(values.length - 1, Math.floor(f)));
  const j = Math.min(values.length - 1, i + 1);
  const a = values[i];
  const b = values[j];
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const t = Math.max(0, Math.min(1, f - i));
  return a + (b - a) * t;
}

/**
 * הסדרה שמתחת לסמן: קודם קו בטווח tolerance (ביחידות הנתונים), אחר כך הרצועה שמכילה את הערך.
 * הרצועות נבדקות בסדר שהתקבל (הראשונה גוברת, למשל פס ההפחתות שמצויר מעל הערימה).
 * f = האינדקס השברי של השנה, value = הערך בציר Y בנקודת הסמן.
 */
export function pickHovered(
  bands: HoverBand[],
  lines: HoverLine[],
  f: number,
  value: number,
  tolerance: number,
): number | null {
  let best: { idx: number; d: number } | null = null;
  for (const l of lines) {
    const v = lerpAt(l.values, f);
    if (v === null) continue;
    const d = Math.abs(v - value);
    if (d <= tolerance && (best === null || d < best.d)) best = { idx: l.seriesIndex, d };
  }
  if (best) return best.idx;
  for (const b of bands) {
    const lo = lerpAt(b.lower, f);
    const hi = lerpAt(b.upper, f);
    if (lo === null || hi === null || hi - lo <= 1e-9) continue;
    if (value >= lo && value <= hi) return b.seriesIndex;
  }
  return null;
}

/** גבולות הרצועות של ערימה: לכל שכבה, מהסכום שמתחתיה ועד הסכום כולל אותה (null = 0). */
export function stackBands(base: number[] | null, layers: { seriesIndex: number; values: (number | null)[] }[]) {
  const n = layers[0]?.values.length ?? base?.length ?? 0;
  let acc = base ? base.slice() : new Array<number>(n).fill(0);
  return layers.map((l) => {
    const upper = acc.map((a, k) => a + (l.values[k] ?? 0));
    const band: HoverBand = { seriesIndex: l.seriesIndex, lower: acc, upper };
    acc = upper;
    return band;
  });
}
