import { useMemo } from 'react';
import { he } from '../../i18n/he';
import {
  factorOf,
  fuelCo2,
  fuelGasVolume,
  fuelRatios,
  sourceCo2,
  sourceGasVolume,
  type FuelRatio,
  type SourceFactor,
} from '../../model/fuel';
import type { SupplyPoint } from '../../model/supply';
import { toBCM, toGW, toMt, toMtoe, toPJ, toTWh } from '../../model/units';
import type { EnergyUnit, Units } from '../../store/uiStore';

/** J → the chosen total-energy unit (million toe, PJ or TWh). */
export function energyFactor(eu: EnergyUnit): number {
  return eu === 'pj' ? toPJ(1) : eu === 'twh' ? toTWh(1) : toMtoe(1);
}

/** Tooltip digits for each total-energy unit (PJ values are in the hundreds). */
const ENERGY_DIGITS: Record<EnergyUnit, number> = { mtoe: 1, pj: 0, twh: 1 };

/** The total-energy unit's label and tooltip digits. */
export function energyUnitInfo(eu: EnergyUnit): { unit: string; digits: number } {
  return { unit: he.topBar.energyUnitLabel[eu], digits: ENERGY_DIGITS[eu] };
}

/** The unit label and tooltip digits of each units mode; `toe` (total energy) follows `eu`. */
export function unitInfo(units: Units, eu: EnergyUnit = 'mtoe'): { unit: string; digits?: number } {
  if (units === 'toe') return energyUnitInfo(eu);
  const unit = he.topBar.unitLabel[units];
  return units === 'bcm' || units === 'co2' ? { unit, digits: 1 } : { unit };
}

/** The factor from J (final energy) to the display unit: TWh (electricity mode), else the total-energy unit. */
export const energyDisplayFactor = (units: Units, eu: EnergyUnit = 'mtoe'): number =>
  units === 'twh' ? toTWh(1) : energyFactor(eu);

/** מקדם ההמרה מ-J חשמל ליחידת התצוגה (TWh / שעט"ן / BCM / Mt CO₂eq) לפי תמהיל השנה. */
export function ratioOf(units: Units, r: FuelRatio | undefined, eu: EnergyUnit = 'mtoe'): number {
  // Total energy: final energy in both charts, so the supply chart's demand line equals the demand chart's net line.
  if (units === 'toe') return energyFactor(eu);
  if (units === 'bcm') return toBCM(r?.gasVolumePerJ ?? 0);
  if (units === 'co2') return toMt(r?.co2PerJ ?? 0);
  return toTWh(1);
}

/**
 * מקדם ההמרה של כל שנה (ratioOf) לפי תמהיל ההיצע: ממיר ערכי ביקוש (J) ליחידת התצוגה.
 * מחזיר פונקציה יציבה כל עוד ההיצע, המקדמים והיחידות לא משתנים.
 */
export function useUnitFactor(
  units: Units,
  supplyPoints: SupplyPoint[],
  years: number[],
  factor: (key: string) => SourceFactor = factorOf,
  eu: EnergyUnit = 'mtoe',
): (year: number) => number {
  return useMemo(() => {
    const ratios = new Map(fuelRatios(supplyPoints, years, factor).map((r) => [r.year, r]));
    return (year: number) => ratioOf(units, ratios.get(year), eu);
  }, [supplyPoints, years, units, factor, eu]);
}

/** הסבר היחידה בהערת השוליים של הגרף ('' כשאין צורך). במצב GW רק גרף ההיצע מסביר. */
export function modeNote(units: Units, side: 'demand' | 'supply'): string {
  const s = he.supply;
  // גרף הביקוש תמיד באנרגיה סופית (גם במצבי BCM ו-tCO₂eq הוא מוצג בשעט"ן).
  if (side === 'demand') return units === 'twh' || units === 'gw' ? '' : s.toeDemandNote;
  return { twh: '', gw: s.gwModeNote, toe: s.toeModeNote, bcm: s.bcmModeNote, co2: s.co2ModeNote }[units];
}

/**
 * הערך לתצוגה של נקודת היצע חשמל בכל מצב יחידות (GW: ההספק המובטח). `factor`: מקדמי המקור (factorsOf של
 * התרחיש), לצריכת הגז ולפליטות.
 */
export function supplyValue(
  units: Units,
  factor: (key: string) => SourceFactor = factorOf,
  eu: EnergyUnit = 'mtoe',
): (p: SupplyPoint) => number {
  const ef = energyFactor(eu);
  switch (units) {
    case 'twh':
      return (p) => toTWh(p.energy);
    case 'gw':
      return (p) => toGW(p.firmPower);
    case 'toe':
      return (p) => p.energy * ef;
    case 'bcm':
      return (p) => toBCM(sourceGasVolume(factor(p.source), p.energy));
    case 'co2':
      return (p) => toMt(sourceCo2(factor(p.source), p.energy));
  }
}

/**
 * הערך לתצוגה של דלק בשימוש ישיר (J אנרגיה סופית) בכל מצב יחידות. במצב GW אין לו ערך (0): הדלקים לא
 * נכנסים להשוואת ההספק מול השיא.
 */
export function fuelValue(units: Units, key: string, energy: number, eu: EnergyUnit = 'mtoe'): number {
  switch (units) {
    case 'twh':
      return toTWh(energy);
    case 'toe':
      return energy * energyFactor(eu);
    case 'bcm':
      return toBCM(fuelGasVolume(key, energy));
    case 'co2':
      return toMt(fuelCo2(key, energy));
    case 'gw':
      return 0;
  }
}
