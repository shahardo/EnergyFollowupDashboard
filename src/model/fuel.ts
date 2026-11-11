import type { SupplyPoint } from './supply';

/** מיליון טון שווה ערך נפט (Mtoe, מיליון שעט"ן) ב-TWh אחד. */
export const TOE_PER_TWH = 0.086;

/**
 * נצילות ההמרה מאנרגיה ראשונית לחשמל, לפי מפתח המקור (מוסכמת IEA: שמש, רוח ויבוא חשמל 1:1;
 * גרעין 33%, גיאותרמיה 10%; דלקים לפי נצילות התחנה). מקור שלא מופיע כאן: 1.
 */
export const PRIMARY_EFFICIENCY: Record<string, number> = {
  gas: 0.5,
  lng: 0.5,
  coal: 0.38,
  importFossil: 0.4,
  importClean: 0.4,
  hydrogenImport: 0.5,
  other: 0.4,
  nuclear: 0.33,
  fusion: 0.33,
  geothermal: 0.1,
};

/** המקורות ששורפים גז טבעי. */
export const GAS_SOURCES: readonly string[] = ['gas', 'lng'];

/** תוכן האנרגיה של מיליארד מ"ק גז טבעי (TWh תרמי; ~37 MJ/m³). */
export const TWH_TH_PER_BCM = 10.3;

export const primaryEfficiency = (key: string): number => PRIMARY_EFFICIENCY[key] ?? 1;

/** אנרגיה ראשונית (Mtoe) של מקור שמייצר twh חשמל. */
export const sourceMtoe = (key: string, twh: number): number => (twh / primaryEfficiency(key)) * TOE_PER_TWH;

/** צריכת הגז (BCM) של מקור שמייצר twh חשמל; 0 למקור שאינו גז. */
export const sourceBcm = (key: string, twh: number): number =>
  GAS_SOURCES.includes(key) ? twh / primaryEfficiency(key) / TWH_TH_PER_BCM : 0;

/**
 * פליטות גזי חממה של ייצור החשמל, מיליון טון CO₂eq לכל TWh (= g/kWh ÷ 1000). ערכי דוגמה: מחזור חיים,
 * חציוני IPCC AR5 (LNG כולל הנזלה ושינוע). אגירה 0 (האנרגיה נספרת במקור הטוען); יבוא חשמל 0 (נפלט בחו"ל).
 * מקור שלא מופיע כאן: 0.
 */
export const EMISSION_FACTOR: Record<string, number> = {
  gas: 0.49,
  lng: 0.55,
  coal: 0.82,
  importFossil: 0.65,
  other: 0.5,
  solar: 0.048,
  wind: 0.011,
  geothermal: 0.038,
  nuclear: 0.012,
  fusion: 0.012,
  importClean: 0.05,
  hydrogenImport: 0.05,
};

export const emissionFactor = (key: string): number => EMISSION_FACTOR[key] ?? 0;

/** פליטות (מיליון טון CO₂eq) של מקור שמייצר twh חשמל. */
export const sourceMtCo2 = (key: string, twh: number): number => twh * emissionFactor(key);

export interface FuelRatio {
  year: number;
  /** Mtoe ראשוני לכל TWh חשמל, בתמהיל ההיצע של השנה. */
  mtoePerTWh: number;
  /** BCM גז לכל TWh חשמל, בתמהיל ההיצע של השנה. */
  bcmPerTWh: number;
  /** מיליון טון CO₂eq לכל TWh חשמל, בתמהיל ההיצע של השנה. */
  co2PerTWh: number;
}

/** יחסי ההמרה של תמהיל ההיצע בכל שנה (0 בשנה בלי היצע). משמשים להמרת הביקוש. */
export function fuelRatios(points: SupplyPoint[], years: number[]): FuelRatio[] {
  return years.map((year) => {
    let twh = 0;
    let mtoe = 0;
    let bcm = 0;
    let co2 = 0;
    for (const p of points) {
      if (p.year !== year) continue;
      twh += p.twh;
      mtoe += sourceMtoe(p.source, p.twh);
      bcm += sourceBcm(p.source, p.twh);
      co2 += sourceMtCo2(p.source, p.twh);
    }
    return twh > 0
      ? { year, mtoePerTWh: mtoe / twh, bcmPerTWh: bcm / twh, co2PerTWh: co2 / twh }
      : { year, mtoePerTWh: 0, bcmPerTWh: 0, co2PerTWh: 0 };
  });
}
