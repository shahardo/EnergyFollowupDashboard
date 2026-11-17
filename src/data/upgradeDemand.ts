import type { DemandScenario, SectorDemand } from '../schema';
import { baselineDemand } from './baseline';
import { splitSectors } from './catalog';
import { mergeByBaseline } from './mergeByBaseline';

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * מגזרים שפוצלו (חימום וקירור, חום תעשייתי) ושחסרים בתרחיש: נלקחים מהמגזר המקורי של התרחיש עצמו, בחלקים
 * שבקטלוג (חשמל, דלקים, גז), ואותו חלק יורד מהמקורי. כך סך הביקוש של תרחיש ישן לא משתנה.
 */
function splitMissing(sectors: SectorDemand[], base: DemandScenario): SectorDemand[] {
  let out = sectors;
  for (const c of splitSectors) {
    const parent = out.find((s) => s.key === c.parent);
    if (out.some((s) => s.key === c.key) || !parent) continue;
    const label = base.sectors.find((s) => s.key === c.key)?.label ?? c.key;
    const take = r6(parent.baseTWh * c.split.elec);
    const ne = parent.nonElectric;
    const neTake = ne && { fuels: r6(ne.fuelsTWh * c.split.fuels), gas: r6(ne.gasTWh * c.split.gas) };
    const { subSectors: _s, nonElectric: _n, ...rest } = parent;
    void _s;
    void _n;
    const heat: SectorDemand = {
      ...rest,
      key: c.key,
      label,
      baseTWh: take,
      ...(ne && neTake ? { nonElectric: { ...ne, fuelsTWh: neTake.fuels, gasTWh: neTake.gas } } : {}),
    };
    const reduced: SectorDemand = {
      ...parent,
      baseTWh: r6(parent.baseTWh - take),
      ...(ne && neTake
        ? { nonElectric: { ...ne, fuelsTWh: r6(ne.fuelsTWh - neTake.fuels), gasTWh: r6(ne.gasTWh - neTake.gas) } }
        : {}),
    };
    out = [...out.map((s) => (s === parent ? reduced : s)), heat];
  }
  if (out === sectors) return sectors;
  // סדר הבסיס (מיון יציב; מגזרים שלא מוכרים לבסיס נשארים בסוף).
  const rank = new Map(base.sectors.map((s, i) => [s.key, i]));
  const at = (k: string) => rank.get(k) ?? Infinity;
  return out
    .map((x, i) => ({ x, i }))
    .sort((a, b) => at(a.x.key) - at(b.x.key) || a.i - b.i)
    .map(({ x }) => x);
}

/** תוויות ישנות של מגזרים שהוחלפו בתווית הבסיס. */
const LEGACY_LABELS: Record<string, string[]> = { transport: ['תחבורה (חשמול)', 'תחבורה (חשמל)'] };

/** מגזר מגרסה קודמת: תווית ישנה מוחלפת, וביקוש שאינו חשמל (אם חסר) מגיע מהבסיס. */
function upgradeSector(s: SectorDemand, base: SectorDemand | undefined): SectorDemand {
  if (!base) return s;
  const relabel = LEGACY_LABELS[s.key]?.includes(s.label) && s.label !== base.label;
  const addNonElectric = s.nonElectric === undefined && base.nonElectric !== undefined;
  const addSubs = s.subSectors === undefined && base.subSectors !== undefined;
  if (!relabel && !addNonElectric && !addSubs) return s;
  return {
    ...s,
    ...(relabel ? { label: base.label } : {}),
    ...(addNonElectric ? { nonElectric: { ...base.nonElectric! } } : {}),
    ...(addSubs ? { subSectors: structuredClone(base.subSectors!) } : {}),
  };
}

/**
 * מעדכן תרחיש ביקוש מגרסה קודמת: מגזרים שחסרים (למשל "רשות פלסטינית") נוספים בערכי הבסיס,
 * וסדר המגזרים הוא סדר הבסיס (מגזרים שלא מוכרים לבסיס נשארים בסוף).
 * תרחיש בלי measures מקבל את ההתייעלות והחיסכון של הבסיס; תרחיש עם ערכים מפורשים שומר אותם.
 * מגזר בלי nonElectric מקבל את של הבסיס, ותווית ישנה ("תחבורה (חשמול)") מוחלפת בתווית הבסיס.
 * מגזרי החימום והקירור והחום התעשייתי שחסרים מפוצלים מהמגזר המקורי (הסך לא משתנה), ותחבורה בלי תתי-מגזרים
 * מקבלת את חמשת תתי-המגזרים של הבסיס.
 * `base` הוא התרחיש המוכן שממנו משלימים (ברירת המחדל: ביקוש בינוני).
 * תרחיש שכבר מעודכן חוזר כמו שהוא.
 */
export function upgradeDemand(scenario: DemandScenario, base: DemandScenario = baselineDemand): DemandScenario {
  const merged = mergeByBaseline(splitMissing(scenario.sectors, base), base.sectors);
  const byKey = new Map(base.sectors.map((s) => [s.key, s]));
  const upgraded = merged.map((s) => upgradeSector(s, byKey.get(s.key)));
  const sectors = upgraded.every((s, i) => s === merged[i]) ? merged : upgraded;
  const needMeasures = scenario.measures === undefined && base.measures !== undefined;
  if (sectors === scenario.sectors && !needMeasures) return scenario;
  return {
    ...scenario,
    sectors,
    ...(needMeasures ? { measures: { ...base.measures! } } : {}),
  };
}
