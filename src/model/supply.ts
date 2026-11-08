import type { CapacityPoint, SupplyScenario, SupplySource } from '../schema';
import { HOURS_PER_YEAR_K } from './years';

export interface SupplyPoint {
  year: number;
  source: string;
  gw: number;
  twh: number;
  firmGW: number;
}

/** אינטרפולציה לינארית בין נקודות העוגן. לפני הנקודה הראשונה ואחרי האחרונה הערך קבוע. */
export function interpolateCapacity(points: CapacityPoint[], year: number): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.year - b.year);
  if (year <= sorted[0].year) return sorted[0].gw;
  const last = sorted[sorted.length - 1];
  if (year >= last.year) return last.gw;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (year <= b.year) {
      return a.gw + ((b.gw - a.gw) * (year - a.year)) / (b.year - a.year);
    }
  }
  return last.gw;
}

/** ההספק המותקן של מקור בשנה מסוימת, אחרי סימון ההשתתפות ושנת ההוצאה משימוש. */
export function sourceCapacity(source: SupplySource, year: number): number {
  if (!source.enabled) return 0;
  if (source.retireYear !== undefined && year >= source.retireYear) return 0;
  return interpolateCapacity(source.capacityGW, year);
}

/** TWh = GW × CF × 8.76, ו-firmGW = GW × capacityCredit */
export function computeSupply(scenario: SupplyScenario, years: number[]): SupplyPoint[] {
  const out: SupplyPoint[] = [];
  for (const year of years) {
    for (const s of scenario.sources) {
      const gw = sourceCapacity(s, year);
      out.push({
        year,
        source: s.key,
        gw,
        twh: gw * s.capacityFactor * HOURS_PER_YEAR_K,
        firmGW: gw * s.capacityCredit,
      });
    }
  }
  return out;
}

/** קובע את ההספק בשנה מסוימת: מעדכן את נקודת העוגן של השנה, או מוסיף אחת. שאר הנקודות לא משתנות. */
export function setCapacityAt(points: CapacityPoint[], year: number, gw: number): CapacityPoint[] {
  const exists = points.some((p) => p.year === year);
  const next = exists ? points.map((p) => (p.year === year ? { year, gw } : p)) : [...points, { year, gw }];
  return next.sort((a, b) => a.year - b.year);
}
