/**
 * יחידות: כל הנתונים והחישובים ביחידות SI בסיסיות (J, W, kg, m³, $, שברים). ההמרה ליחידות התצוגה
 * (TWh, GW, Mtoe, BCM, Mt, %) נעשית רק בתצוגה, בייצוא CSV ובמדדים. אותם קבועים ב-backend/energy_model/units.py.
 *
 * השנה היא צעד הזמן של המודל: קצבים שנתיים נשארים "לשנה" (צמיחה, עלות קבועה), ואורך חיים בשנים.
 */

/** שניות בשנה (365 ימים, 8760 שעות). */
export const SECONDS_PER_YEAR = 8760 * 3600;
/** J ב-TWh. */
export const J_PER_TWH = 3.6e15;
/** J ב-PJ. */
export const J_PER_PJ = 1e15;
/** W ב-GW. */
export const W_PER_GW = 1e9;
/** W ב-MW. */
export const W_PER_MW = 1e6;
/** J בטון שווה ערך נפט (toe, הגדרת IEA). */
export const J_PER_TOE = 41.868e9;
/** kg במיליון טון. */
export const KG_PER_MT = 1e9;
/** m³ במיליארד מ"ק (BCM). */
export const M3_PER_BCM = 1e9;
/** תוכן האנרגיה של מ"ק גז טבעי (J; 10.3 TWh תרמי ל-BCM). */
export const J_PER_M3_GAS = (10.3 * J_PER_TWH) / M3_PER_BCM;

/** E[J] של הספק p[W] במקדם ניצול cf לאורך שנה. */
export const energyOf = (power: number, cf: number): number => power * cf * SECONDS_PER_YEAR;
/** P[W] הממוצע של אנרגיה שנתית e[J] במקדם עומס lf (השיא: e / (שנה × lf)). */
export const powerOf = (energy: number, lf: number): number => energy / (SECONDS_PER_YEAR * lf);

// ── המרות לתצוגה ─────────────────────────────────────────────────────────
/** J → TWh. */
export const toTWh = (j: number): number => j / J_PER_TWH;
/** TWh → J. */
export const fromTWh = (twh: number): number => twh * J_PER_TWH;
/** W → GW. */
export const toGW = (w: number): number => w / W_PER_GW;
/** GW → W. */
export const fromGW = (gw: number): number => gw * W_PER_GW;
/** W → MW. */
export const toMW = (w: number): number => w / W_PER_MW;
/** MW → W. */
export const fromMW = (mw: number): number => mw * W_PER_MW;
/** J → מיליון טון שווה ערך נפט (Mtoe, מיליון שעט"ן). */
export const toMtoe = (j: number): number => j / J_PER_TOE / 1e6;
/** J → PJ. */
export const toPJ = (j: number): number => j / J_PER_PJ;
/** m³ → BCM. */
export const toBCM = (m3: number): number => m3 / M3_PER_BCM;
/** kg → מיליון טון (Mt). */
export const toMt = (kg: number): number => kg / KG_PER_MT;
/** שבר → אחוזים. */
export const toPct = (f: number): number => f * 100;
/** אחוזים → שבר. */
export const fromPct = (pct: number): number => pct / 100;
