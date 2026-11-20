import type { SupplySource } from '../schema';
import type { SupplyPoint } from './supply';
import { J_PER_M3_GAS, J_PER_TWH, KG_PER_MT } from './units';

/** Mt/TWh → kg/J. */
const perTWh = (mtPerTWh: number) => (mtPerTWh * KG_PER_MT) / J_PER_TWH;

/**
 * ברירות מחדל למקור בלי efficiency / emissionFactor / inputFuel (קבצים ישנים או מפתח לא מוכר). התרחישים
 * המוכנים נושאים את הערכים בעצמם (src/data/policies). נצילות לפי מוסכמת IEA: שמש, רוח ויבוא חשמל 1,
 * גרעין 0.33, גיאותרמיה 0.1. פליטות מחזור חיים (חציוני IPCC AR5), kg CO₂eq ל-J חשמל.
 */
const DEFAULT_EFFICIENCY: Record<string, number> = {
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
const DEFAULT_EMISSION: Record<string, number> = Object.fromEntries(
  Object.entries({
    gas: 0.49,
    lng: 0.55,
    coal: 0.82,
    importFossil: 0.65,
    other: 0.5,
    solar: 0.048,
    solar30: 0.048,
    solar40: 0.048,
    wind: 0.011,
    geothermal: 0.038,
    nuclear: 0.012,
    fusion: 0.012,
    importClean: 0.05,
    hydrogenImport: 0.05,
  }).map(([k, v]) => [k, perTWh(v)]),
);
/** הדלקים שהם גז טבעי (לצריכת הגז ב-m³). */
const GAS_FUELS = ['NaturalGas', 'LNG'];
const DEFAULT_GAS_SOURCES = ['gas', 'lng'];

/** מקדמי ההמרה של מקור אספקה: נצילות, פליטות ל-J, והאם הוא שורף גז טבעי. */
export interface SourceFactor {
  efficiency: number;
  /** kg CO₂eq ל-J תפוקה. */
  emissionFactor: number;
  burnsGas: boolean;
}

type FactorInput = Pick<SupplySource, 'key' | 'efficiency' | 'emissionFactor' | 'inputFuel'>;

/** המקדמים של מקור: הערכים שלו, ומה שחסר מברירות המחדל לפי המפתח. */
export function factorOf(s: FactorInput | string): SourceFactor {
  const src: FactorInput = typeof s === 'string' ? { key: s } : s;
  return {
    efficiency: src.efficiency ?? DEFAULT_EFFICIENCY[src.key] ?? 1,
    emissionFactor: src.emissionFactor ?? DEFAULT_EMISSION[src.key] ?? 0,
    burnsGas: src.inputFuel !== undefined ? GAS_FUELS.includes(src.inputFuel) : DEFAULT_GAS_SOURCES.includes(src.key),
  };
}

/** פונקציה מהמפתח למקדמים, לפי המקורות של תרחיש (ומפתח לא מוכר: ברירות המחדל). */
export function factorsOf(sources: FactorInput[]): (key: string) => SourceFactor {
  const map = new Map(sources.map((s) => [s.key, factorOf(s)]));
  return (key) => map.get(key) ?? factorOf(key);
}

/** אנרגיה ראשונית (J) של מקור שמייצר energy (J) חשמל. */
export const sourcePrimaryEnergy = (f: SourceFactor, energy: number): number => energy / f.efficiency;

/** צריכת הגז (m³) של מקור שמייצר energy (J) חשמל; 0 למקור שאינו גז. */
export const sourceGasVolume = (f: SourceFactor, energy: number): number =>
  f.burnsGas ? energy / f.efficiency / J_PER_M3_GAS : 0;

/** פליטות (kg CO₂eq) של מקור שמייצר energy (J) חשמל. */
export const sourceCo2 = (f: SourceFactor, energy: number): number => energy * f.emissionFactor;

/** יחסי ההמרה מאנרגיית חשמל (J) ליחידות האחרות, בתמהיל ההיצע של שנה אחת. */
export interface FuelRatio {
  year: number;
  /** אנרגיה ראשונית (J) לכל J חשמל. */
  primaryPerJ: number;
  /** m³ גז לכל J חשמל. */
  gasVolumePerJ: number;
  /** kg CO₂eq לכל J חשמל. */
  co2PerJ: number;
}

/** יחסי ההמרה של תמהיל ההיצע בכל שנה (0 בשנה בלי היצע). משמשים להמרת הביקוש. */
export function fuelRatios(
  points: SupplyPoint[],
  years: number[],
  factor: (key: string) => SourceFactor = factorOf,
): FuelRatio[] {
  // הסכומים לפי שנה, במעבר אחד על כל הנקודות.
  const sums = new Map<number, { energy: number; primary: number; gas: number; co2: number }>();
  for (const p of points) {
    const t = sums.get(p.year) ?? { energy: 0, primary: 0, gas: 0, co2: 0 };
    const f = factor(p.source);
    t.energy += p.energy;
    t.primary += sourcePrimaryEnergy(f, p.energy);
    t.gas += sourceGasVolume(f, p.energy);
    t.co2 += sourceCo2(f, p.energy);
    sums.set(p.year, t);
  }
  return years.map((year) => {
    const { energy, primary, gas, co2 } = sums.get(year) ?? { energy: 0, primary: 0, gas: 0, co2: 0 };
    return energy > 0
      ? { year, primaryPerJ: primary / energy, gasVolumePerJ: gas / energy, co2PerJ: co2 / energy }
      : { year, primaryPerJ: 0, gasVolumePerJ: 0, co2PerJ: 0 };
  });
}

/**
 * פליטות השריפה של דלק בשימוש ישיר (לא לייצור חשמל), kg CO₂eq ל-J אנרגיה סופית. ערכי דוגמה:
 * דלקים פוסיליים (סולר/בנזין) ~0.27 Mt/TWh, גז טבעי ~0.20, דלקים נקיים ומימן לפי מחזור חיים. מפתח לא מוכר: 0.
 */
const FINAL_EMISSION_FACTOR: Record<string, number> = {
  importFossil: perTWh(0.27),
  gasDirect: perTWh(0.2),
  importClean: perTWh(0.05),
  hydrogenImport: perTWh(0.03),
};

/** צריכת הגז (m³) של דלק בשימוש ישיר: רק גז טבעי ישיר (gasDirect). */
export const fuelGasVolume = (key: string, energy: number): number => (key === 'gasDirect' ? energy / J_PER_M3_GAS : 0);

/** פליטות (kg CO₂eq) של דלק בשימוש ישיר. */
export const fuelCo2 = (key: string, energy: number): number => energy * (FINAL_EMISSION_FACTOR[key] ?? 0);
