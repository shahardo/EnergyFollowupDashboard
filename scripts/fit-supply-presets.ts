/**
 * בונה את תשעת תרחישי ההיצע המוכנים: לכל תרחיש ביקוש (נמוך / בינוני / גבוה) ולכל מדיניות
 * (ייחוס / מוצהרת / נבחנת), מתאים את תבנית המדיניות (src/data/policies/) לביקוש נטו
 * בעזרת autoAdjust, כך שהביקוש מסופק (אנרגיה ושיא) בכל שנה.
 * הרצה: npm run fit:supply  → כותב src/data/scenarios/supply-<demand>-<policy>.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { autoAdjust, FIRM_CREDIT_MIN } from '../src/model/autofill';
import { demandTotals, projectDemand } from '../src/model/demand';
import { computeGap } from '../src/model/gap';
import { applyMeasures, netTotals } from '../src/model/measures';
import { computeSupply, setCapacityAt, sourceCapacity } from '../src/model/supply';
import { HOURS_PER_YEAR_K, yearRange } from '../src/model/years';
import {
  DemandFileSchema,
  SupplyFileSchema,
  type DemandPreset,
  type DemandScenario,
  type SupplyPreset,
  type SupplyScenario,
} from '../src/schema';

const DEMANDS: DemandPreset[] = ['low', 'medium', 'high'];
const POLICIES: SupplyPreset[] = ['reference', 'declared', 'tested'];
const DEMAND_NAME: Record<DemandPreset, string> = { low: 'ביקוש נמוך', medium: 'ביקוש בינוני', high: 'ביקוש גבוה' };
const POLICY_NAME: Record<SupplyPreset, string> = {
  reference: 'תרחיש ייחוס',
  declared: 'מדיניות מוצהרת',
  tested: 'מדיניות נבחנת',
};

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

export function netDemand(d: DemandScenario) {
  const measured = applyMeasures(demandTotals(projectDemand(d)), d.measures, d.baseYear, d.horizonYear);
  return netTotals(measured);
}

/** כמה מכסים בשנה הגרועה ביותר (אנרגיה, שיא), באחוזים. */
export function worstCoverage(d: DemandScenario, s: SupplyScenario) {
  const totals = netDemand(d);
  const gap = computeGap(totals, computeSupply(s, yearRange(d.baseYear, d.horizonYear)), s);
  const e = gap.reduce((a, g) => (g.coveragePct < a.coveragePct ? g : a));
  const p = gap.reduce((a, g) => (g.peakCoveragePct < a.peakCoveragePct ? g : a));
  return { energy: e.coveragePct, energyYear: e.year, peak: p.peakCoveragePct, peakYear: p.year };
}

function fmtLine(item: unknown) {
  return JSON.stringify(item).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/\},\{/g, '}, {');
}

function write(path: string, s: SupplyScenario) {
  const { sources, ...head } = s;
  const lines = Object.entries(head).map(([k, v]) => `    ${JSON.stringify(k)}: ${fmtLine(v)},`);
  const out = [
    '{',
    '  "schema": "energy-dashboard/v1",',
    '  "kind": "supply",',
    '  "savedAt": "2026-11-10T00:00:00.000Z",',
    '  "data": {',
    ...lines,
    '    "sources": [',
    sources.map((x) => '      ' + fmtLine(x)).join(',\n'),
    '    ]',
    '  }',
    '}',
    '',
  ].join('\n');
  writeFileSync(path, out);
}

const round = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;

/**
 * autoAdjust מתאים רק בשנות עוגן (כל 5 שנים). כאן משלימים כל שנה שנשאר בה פער:
 * פער אנרגיה לפי סדר fillPriority (מקורות עם CF > 0), ופער שיא קודם ממקורות יציבים, כל מקור עד ה-maxGW שלו.
 * התוספת היא נקודת הספק חדשה באותה שנה, מעל הקו, כך שהיא רק מגדילה את הכיסוי בשנים הסמוכות.
 */
export function topUpEveryYear(d: DemandScenario, s: SupplyScenario): SupplyScenario {
  const totals = netDemand(d);
  const years = yearRange(d.baseYear, d.horizonYear);
  let cur = s;
  type Source = SupplyScenario['sources'][number];
  const candidates = (ok: (x: Source) => boolean) =>
    cur.fillPriority
      .map((k) => cur.sources.find((x) => x.key === k))
      .filter((x): x is Source => !!x && x.enabled && ok(x));
  /** מוסיף עד `gw` הספק למקור בשנה הזו, בלי לעבור את maxGW. מחזיר כמה נוסף. */
  const bump = (src: Source, year: number, gw: number) => {
    const now = sourceCapacity(src, year);
    const add = Math.min(gw, Math.max(0, (src.maxGW ?? Infinity) - now));
    if (add <= 1e-9) return 0;
    cur = {
      ...cur,
      sources: cur.sources.map((x) =>
        x.key === src.key ? { ...x, capacityGW: setCapacityAt(x.capacityGW, year, round(now + add)) } : x,
      ),
    };
    return add;
  };
  const at = (year: number) =>
    computeGap(
      totals.filter((t) => t.year === year),
      computeSupply(cur, [year]),
      cur,
    )[0];
  for (const year of years) {
    for (const src of candidates((x) => x.capacityFactor > 0)) {
      const gap = at(year).gapTWh;
      if (gap <= 1e-6) break;
      bump(cur.sources.find((x) => x.key === src.key)!, year, gap / (src.capacityFactor * HOURS_PER_YEAR_K));
    }
    const firm = [
      ...candidates((x) => x.capacityCredit >= FIRM_CREDIT_MIN),
      ...candidates((x) => x.capacityCredit > 0 && x.capacityCredit < FIRM_CREDIT_MIN),
    ];
    for (const src of firm) {
      const gap = at(year).peakGapGW;
      if (gap <= 1e-6) break;
      bump(cur.sources.find((x) => x.key === src.key)!, year, gap / src.capacityCredit);
    }
  }
  return cur;
}

export function main() {
  for (const dp of DEMANDS) {
    const demand = DemandFileSchema.parse(read(`src/data/scenarios/demand-${dp}.json`)).data;
    const totals = netDemand(demand);
    for (const pp of POLICIES) {
      const policy = SupplyFileSchema.parse(read(`src/data/policies/supply-${pp}.json`)).data;
      const adjusted = topUpEveryYear(demand, autoAdjust(totals, policy).scenario);
      const fitted: SupplyScenario = {
        ...adjusted,
        id: `preset-supply-${dp}-${pp}`,
        name: `${POLICY_NAME[pp]} · ${DEMAND_NAME[dp]} (ערכי דוגמה)`,
        preset: pp,
        demandPreset: dp,
      };
      write(`src/data/scenarios/supply-${dp}-${pp}.json`, fitted);
      const c = worstCoverage(demand, fitted);
      console.log(
        `${dp}-${pp}: energy ${c.energy.toFixed(1)}% (${c.energyYear})  peak ${c.peak.toFixed(1)}% (${c.peakYear})`,
      );
    }
  }
}

main();
