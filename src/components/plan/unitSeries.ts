import { useMemo } from 'react';
import { he } from '../../i18n/he';
import { fuelRatios, type FuelRatio } from '../../model/fuel';
import type { SupplyPoint } from '../../model/supply';
import type { Units } from '../../store/uiStore';

/** תווית היחידה וספרות הטולטיפ לכל מצב יחידות. */
export function unitInfo(units: Units): { unit: string; digits?: number } {
  const unit = he.topBar.unitLabel[units];
  return units === 'toe' || units === 'bcm' || units === 'co2' ? { unit, digits: 1 } : { unit };
}

/** מקדם ההמרה מ-TWh חשמל ליחידה (שעט"ן / BCM / tCO₂eq) לפי תמהיל השנה; 1 במצב TWh. */
export function ratioOf(units: Units, r: FuelRatio | undefined): number {
  if (units === 'toe') return r?.mtoePerTWh ?? 0;
  if (units === 'bcm') return r?.bcmPerTWh ?? 0;
  if (units === 'co2') return r?.co2PerTWh ?? 0;
  return 1;
}

/**
 * מקדם ההמרה של כל שנה (ratioOf) לפי תמהיל ההיצע: ממיר ערכי ביקוש ב-TWh ליחידה הנבחרת.
 * מחזיר פונקציה יציבה כל עוד ההיצע והיחידות לא משתנים.
 */
export function useUnitFactor(units: Units, supplyPoints: SupplyPoint[], years: number[]): (year: number) => number {
  return useMemo(() => {
    const ratios = new Map(fuelRatios(supplyPoints, years).map((r) => [r.year, r]));
    return (year: number) => ratioOf(units, ratios.get(year));
  }, [supplyPoints, years, units]);
}

/** הסבר היחידה בהערת השוליים של הגרף ('' כשאין צורך). במצב GW רק גרף ההיצע מסביר. */
export function modeNote(units: Units, side: 'demand' | 'supply'): string {
  const s = he.supply;
  return { twh: '', gw: side === 'supply' ? s.gwModeNote : '', toe: s.toeModeNote, bcm: s.bcmModeNote, co2: s.co2ModeNote }[
    units
  ];
}
