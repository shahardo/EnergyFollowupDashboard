import type { ScenarioPlanParams } from '../schema';
import { interpolateCapacity } from '../model/supply';
import type { PlanElectricKey, PlanSourceMeta } from '../model/scenarioPlan';
import { baselineDemand, baselineSupply } from './baseline';

const baseSource = (key: string) => baselineSupply.sources.find((s) => s.key === key);
const metaOf = (key: string, fallback: PlanSourceMeta): PlanSourceMeta => {
  const s = baseSource(key);
  return s ? { capacityFactor: s.capacityFactor, capacityCredit: s.capacityCredit } : fallback;
};

/**
 * CF ו-capacity credit של מקורות החשמל בתכנון התרחישים (ערכי דוגמה, מתרחיש ההיצע הבסיסי).
 * סולארי 30% / 40% מקבלים את ה-CF של הסולארי: נצילות הפאנל משנה את התפוקה למ"ר, לא ל-GW.
 */
export const planSourceMeta: Record<PlanElectricKey, PlanSourceMeta> = {
  solar: metaOf('solar', { capacityFactor: 0.19, capacityCredit: 0.05 }),
  solar30: metaOf('solar', { capacityFactor: 0.19, capacityCredit: 0.05 }),
  solar40: metaOf('solar', { capacityFactor: 0.19, capacityCredit: 0.05 }),
  importElectricity: metaOf('importElectricity', { capacityFactor: 0.6, capacityCredit: 0.7 }),
  geothermal: metaOf('geothermal', { capacityFactor: 0.85, capacityCredit: 0.9 }),
  fusion: metaOf('fusion', { capacityFactor: 0.85, capacityCredit: 0.9 }),
  gas: metaOf('gas', { capacityFactor: 0.55, capacityCredit: 0.95 }),
};

const solarBase = baseSource('solar');

/** ערכי ברירת המחדל של כללי תכנון התרחישים (ערכי דוגמה). */
export const defaultPlanParams: ScenarioPlanParams = {
  solar: {
    baseGW: solarBase ? interpolateCapacity(solarBase.capacityGW, baselineDemand.baseYear) : 5.7,
    slopeGW: 1,
  },
  solar30: { start: 2030, slopeGW: 0.5 },
  solar40: { start: 2035, slopeGW: 0.5 },
  importElectricity: { start: 2030, stepGW: 1, stepYears: 5, steps: 4 },
  geothermal: { start: 2035, rateGW: 0.5, rampYears: 5 },
  fusion: { start: 2040, rateGW: 0.5, rampYears: 5 },
  cleanFuels: { start: 2030, sharePct: 20 },
  hydrogen: { start: 2040, sharePct: 10 },
};
