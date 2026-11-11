import { he } from '../../i18n/he';
import type { FuelRatio } from '../../model/fuel';
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
