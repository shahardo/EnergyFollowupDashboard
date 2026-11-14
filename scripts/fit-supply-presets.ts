/**
 * בונה את תשעת תרחישי ההיצע המוכנים: לכל תרחיש ביקוש (נמוך / בינוני / גבוה) ולכל מדיניות
 * (ייחוס / מוצהרת / נבחנת), לוקח את תבנית המדיניות (src/data/policies/), כותב את מקורות הכללים לפי
 * כללי התכנון של המדיניות (planPresets: סולארי, סולארי 30% / 40%, יבוא חשמל, גיאותרמיה, היתוך), והגז
 * משלים את מה שנשאר, כך שהביקוש נטו מסופק (אנרגיה ושיא) בכל שנה. שאר המקורות נשארים כמו בתבנית.
 * הרצה: npm run fit:supply  → כותב src/data/scenarios/supply-<demand>-<policy>.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { he } from '../src/i18n/he';
import { planPresets } from '../src/data/scenarioPlan';
import { applyPlanRules } from '../src/model/scenarioPlan';
import { computeDemandSeries, computeSeries, type DemandSeries } from '../src/model/series';
import {
  DemandFileSchema,
  DemandPresetSchema,
  SupplyFileSchema,
  SupplyPresetSchema,
  type SupplyScenario,
} from '../src/schema';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

/** כמה מכסים בשנה הגרועה ביותר (אנרגיה, שיא), באחוזים. */
function worstCoverage(d: DemandSeries, s: SupplyScenario) {
  const { gap } = computeSeries(d, s);
  const e = gap.reduce((a, g) => (g.coveragePct < a.coveragePct ? g : a));
  const p = gap.reduce((a, g) => (g.peakCoveragePct < a.peakCoveragePct ? g : a));
  return { energy: e.coveragePct, energyYear: e.year, peak: p.peakCoveragePct, peakYear: p.year };
}

/** שורת JSON אחת בעיצוב הקבצים: רווח אחרי פסיקים ונקודתיים. */
function fmtLine(item: unknown) {
  return JSON.stringify(item).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/\},\{/g, '}, {');
}

/** כותב תרחיש היצע כקובץ שמור: שדה בכל שורה, ומקור בכל שורה. */
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

function main() {
  for (const dp of DemandPresetSchema.options) {
    const demand = computeDemandSeries(DemandFileSchema.parse(read(`src/data/scenarios/demand-${dp}.json`)).data);
    for (const pp of SupplyPresetSchema.options) {
      const policy = SupplyFileSchema.parse(read(`src/data/policies/supply-${pp}.json`)).data;
      const adjusted = applyPlanRules({ ...policy, planParams: planPresets[pp] }, demand.totals);
      const name = `${he.plan.supplyPresets[pp].label} · ${he.plan.demandPresets[dp].label} (ערכי דוגמה)`;
      const fitted: SupplyScenario = { ...adjusted, id: `preset-supply-${dp}-${pp}`, name, preset: pp, demandPreset: dp };
      write(`src/data/scenarios/supply-${dp}-${pp}.json`, fitted);
      const c = worstCoverage(demand, fitted);
      console.log(
        `${dp}-${pp}: energy ${c.energy.toFixed(1)}% (${c.energyYear})  peak ${c.peak.toFixed(1)}% (${c.peakYear})`,
      );
    }
  }
}

// הסקריפט לא מייצא דבר: הוא נועד רק להרצה (ייבוא שלו היה כותב את קובצי התרחישים).
main();
