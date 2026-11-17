import type { PriorityWeights, StartYearRange } from '../model/priority';
import { fromGW } from '../model/units';
import type { TrilemmaScore } from '../schema';

/**
 * ציוני טרילמה לכל ערוץ אספקה (ערכי דוגמה, להערכה בלבד): ביטחון, נגישות כלכלית, קיימות (0..10),
 * ויישימות בישראל (שבר, 0..1). ערוץ שלא מופיע כאן מקבל את ערכי "אחר".
 */
export const trilemmaScores: Record<string, TrilemmaScore> = {
  gas: { security: 7, affordability: 8, sustainability: 4, feasibility: 0.8 },
  lng: { security: 5, affordability: 5, sustainability: 4, feasibility: 0.4 },
  coal: { security: 6, affordability: 6, sustainability: 1, feasibility: 0.2 },
  solar: { security: 6, affordability: 9, sustainability: 9, feasibility: 0.9 },
  solar30: { security: 6, affordability: 8, sustainability: 9, feasibility: 0.6 },
  solar40: { security: 6, affordability: 7, sustainability: 9, feasibility: 0.45 },
  wind: { security: 5, affordability: 6, sustainability: 9, feasibility: 0.35 },
  geothermal: { security: 8, affordability: 4, sustainability: 9, feasibility: 0.05 },
  storage: { security: 7, affordability: 5, sustainability: 8, feasibility: 0.75 },
  nuclear: { security: 9, affordability: 3, sustainability: 8, feasibility: 0.1 },
  fusion: { security: 9, affordability: 2, sustainability: 10, feasibility: 0.02 },
  importElectricity: { security: 3, affordability: 6, sustainability: 6, feasibility: 0.15 },
  importFossil: { security: 4, affordability: 5, sustainability: 2, feasibility: 0.25 },
  importClean: { security: 4, affordability: 3, sustainability: 8, feasibility: 0.1 },
  hydrogenImport: { security: 4, affordability: 2, sustainability: 9, feasibility: 0.08 },
  gasCcs: { security: 7, affordability: 5, sustainability: 6, feasibility: 0.2 },
  solarRooftop: { security: 7, affordability: 7, sustainability: 9, feasibility: 0.7 },
  csp: { security: 7, affordability: 4, sustainability: 9, feasibility: 0.15 },
  pumpedHydro: { security: 8, affordability: 5, sustainability: 8, feasibility: 0.3 },
  hydrogenPower: { security: 6, affordability: 3, sustainability: 8, feasibility: 0.15 },
  hydrogenGreen: { security: 7, affordability: 3, sustainability: 9, feasibility: 0.2 },
  hydrogenBlue: { security: 7, affordability: 4, sustainability: 5, feasibility: 0.15 },
  wte: { security: 7, affordability: 5, sustainability: 6, feasibility: 0.4 },
  other: { security: 5, affordability: 5, sustainability: 5, feasibility: 0.5 },
};

/** הציונים של ערוץ לפי מפתח המקור; ערוץ לא מוכר מקבל את ערכי "אחר". */
export const scoreFor = (key: string): TrilemmaScore => trilemmaScores[key] ?? trilemmaScores.other;

/**
 * תקרת ההספק הכולל (W; נכתבת כאן ב-GW) של כל ערוץ בכלי התעדוף (ערכי דוגמה): פוטנציאל מרבי בישראל עד 2050.
 * null = בלי תקרה. ערוץ שלא מופיע כאן: בלי תקרה. פחם: 0, כלומר אין בנייה חדשה (רק הצי הקיים).
 */
export const defaultMaxPower: Record<string, number | null> = Object.fromEntries(
  Object.entries({
    gas: null,
    lng: 6,
    coal: 0,
    solar: 90,
    solar30: 20,
    solar40: 20,
    wind: 8,
    geothermal: 3,
    storage: null,
    nuclear: 4,
    fusion: 2,
    importElectricity: 6,
    importFossil: 4,
    importClean: 5,
    hydrogenImport: 5,
    gasCcs: 4,
    solarRooftop: 20,
    csp: 2,
    pumpedHydro: 2,
    hydrogenPower: 3,
    hydrogenGreen: 4,
    hydrogenBlue: 3,
    wte: 0.5,
    other: 1,
  } as Record<string, number | null>).map(([k, gw]) => [k, gw === null ? null : fromGW(gw)]),
);

/** ערכות משקלות מוכנות לכלי התעדוף (באחוזים). */
export const weightPresets: Record<'climate' | 'balanced' | 'security', PriorityWeights> = {
  climate: { sustainability: 80, affordability: 10, security: 10, feasibility: 0 },
  balanced: { sustainability: 25, affordability: 25, security: 25, feasibility: 25 },
  security: { sustainability: 10, affordability: 20, security: 60, feasibility: 10 },
};

/** ברירת המחדל של המשקלות. */
export const defaultWeights: PriorityWeights = {
  sustainability: 70,
  affordability: 10,
  security: 10,
  feasibility: 10,
};

/**
 * טווח שנות התחלת האספקה של ערוצים עם זמן תכנון והקמה ארוך (ערכי דוגמה): השנה המוקדמת והריאלית.
 * שנת ההתחלה בפועל נעה ביניהן לפי משקל היישימות. ערוץ שלא מופיע כאן יכול להתחיל משנת הבסיס.
 */
export const defaultStartYears: Record<string, StartYearRange> = {
  fusion: { earliest: 2035, realistic: 2045 },
  nuclear: { earliest: 2035, realistic: 2042 },
  geothermal: { earliest: 2035, realistic: 2040 },
  lng: { earliest: 2035, realistic: 2038 },
  hydrogenImport: { earliest: 2032, realistic: 2038 },
  importClean: { earliest: 2030, realistic: 2035 },
  importElectricity: { earliest: 2030, realistic: 2035 },
  importFossil: { earliest: 2025, realistic: 2025 },
  gasCcs: { earliest: 2032, realistic: 2036 },
  csp: { earliest: 2030, realistic: 2035 },
  pumpedHydro: { earliest: 2030, realistic: 2034 },
  hydrogenPower: { earliest: 2033, realistic: 2038 },
  hydrogenGreen: { earliest: 2030, realistic: 2036 },
  hydrogenBlue: { earliest: 2031, realistic: 2036 },
  wte: { earliest: 2028, realistic: 2031 },
};
