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
import { toBCM, toGW, toMt, toMtoe, toTWh } from '../../model/units';
import type { Units } from '../../store/uiStore';

/** תווית היחידה וספרות הטולטיפ לכל מצב יחידות. */
export function unitInfo(units: Units): { unit: string; digits?: number } {
  const unit = he.topBar.unitLabel[units];
  return units === 'toe' || units === 'bcm' || units === 'co2' ? { unit, digits: 1 } : { unit };
}

/** המקדם מ-J (אנרגיה סופית) ליחידת התצוגה של אנרגיה: TWh, או מיליון שעט"ן במצבי האנרגיה האחרים. */
export const energyDisplayFactor = (units: Units): number => (units === 'twh' ? toTWh(1) : toMtoe(1));

/** מקדם ההמרה מ-J חשמל ליחידת התצוגה (TWh / שעט"ן / BCM / Mt CO₂eq) לפי תמהיל השנה. */
export function ratioOf(units: Units, r: FuelRatio | undefined): number {
  // שעט"ן: אנרגיה סופית בשני הגרפים, כך שקו הביקוש בגרף ההיצע שווה לביקוש נטו בגרף הביקוש.
  if (units === 'toe') return toMtoe(1);
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
): (year: number) => number {
  return useMemo(() => {
    const ratios = new Map(fuelRatios(supplyPoints, years, factor).map((r) => [r.year, r]));
    return (year: number) => ratioOf(units, ratios.get(year));
  }, [supplyPoints, years, units, factor]);
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
export function supplyValue(units: Units, factor: (key: string) => SourceFactor = factorOf): (p: SupplyPoint) => number {
  switch (units) {
    case 'twh':
      return (p) => toTWh(p.energy);
    case 'gw':
      return (p) => toGW(p.firmPower);
    case 'toe':
      return (p) => toMtoe(p.energy);
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
export function fuelValue(units: Units, key: string, energy: number): number {
  switch (units) {
    case 'twh':
      return toTWh(energy);
    case 'toe':
      return toMtoe(energy);
    case 'bcm':
      return toBCM(fuelGasVolume(key, energy));
    case 'co2':
      return toMt(fuelCo2(key, energy));
    case 'gw':
      return 0;
  }
}
