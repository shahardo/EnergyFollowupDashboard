/**
 * הסקריפט החד-פעמי שהעביר את קובצי הנתונים (src/data) לפורמט v2 ביחידות SI, והוסיף לכל מקור אספקה את
 * הנתונים הכלכליים והטכניים (ערכי דוגמה) שמודל OSeMOSYS צריך. נשמר לתיעוד; מכאן והלאה קובצי ה-JSON הם המקור.
 * הרצה: npx vite-node scripts/migrate-data-v2.ts  (על קבצים שעדיין ב-v1)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  migrateDemandV1,
  migratePlanParamsV1,
  migrateProjectsV1,
  migrateSupplyV1,
} from '../src/io/migrateV1';
import { J_PER_TWH, KG_PER_MT } from '../src/model/units';
import type { SupplySource } from '../src/schema';
import {
  DemandFileSchemaV1,
  ProjectsFileSchemaV1,
  SCHEMA_VERSION_V1,
  ScenarioPlanParamsSchemaV1,
  SupplyFileSchemaV1,
} from '../src/schema/v1';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

/** שורת JSON אחת בעיצוב הקבצים: רווח אחרי פסיקים ונקודתיים. */
const fmtLine = (item: unknown) =>
  JSON.stringify(item).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/\},\{/g, '}, {');

/** קובץ שמור: שדה בכל שורה, ופריט בכל שורה ברשימה `list`. */
function render(kind: string, savedAt: string, data: Record<string, unknown>, list: string): string {
  const items = data[list] as unknown[];
  const head = Object.entries(data).filter(([k]) => k !== list);
  return [
    '{',
    '  "schema": "energy-dashboard/v2",',
    `  "kind": "${kind}",`,
    `  "savedAt": "${savedAt}",`,
    '  "data": {',
    ...head.map(([k, v]) => `    ${JSON.stringify(k)}: ${fmtLine(v)},`),
    `    ${JSON.stringify(list)}: [`,
    items.map((x) => '      ' + fmtLine(x)).join(',\n'),
    '    ]',
    '  }',
    '}',
    '',
  ].join('\n');
}

// ── הנתונים הכלכליים של המקורות (ערכי דוגמה, סדרי גודל של IEA / NREL ATB) ────────────
// עלות הון $/W, קבועה $/W לשנה, משתנה $/MWh (בלי דלק), אורך חיים, נצילות, דלק, פליטות מחזור חיים Mt/TWh
// (כמו EMISSION_FACTOR בדשבורד), שנה ראשונה לבנייה, פרופיל זמינות.
type Econ = [number, number, number, number, number | null, string | null, number, number | null, string | null];
const ECON: Record<string, Econ> = {
  gas: [1.0, 0.025, 3, 30, 0.5, 'NaturalGas', 0.49, null, null],
  lng: [1.0, 0.025, 3, 30, 0.5, 'LNG', 0.55, 2030, null],
  gasCcs: [2.2, 0.06, 6, 30, 0.42, 'NaturalGas', 0.17, 2032, null],
  coal: [2.0, 0.04, 5, 40, 0.38, 'Coal', 0.82, null, null],
  solar: [0.6, 0.012, 0, 25, null, null, 0.048, null, 'solar'],
  solarRooftop: [1.0, 0.018, 0, 25, null, null, 0.041, null, 'solar'],
  solar30: [0.7, 0.012, 0, 25, null, null, 0.048, 2030, 'solar'],
  solar40: [0.85, 0.012, 0, 25, null, null, 0.048, 2033, 'solar'],
  csp: [4.5, 0.07, 0, 30, null, null, 0.027, 2030, 'csp'],
  wind: [1.4, 0.04, 0, 25, null, null, 0.011, null, 'wind'],
  geothermal: [6.0, 0.15, 0, 30, 0.1, null, 0.038, 2035, null],
  storage: [0.35, 0.01, 0, 15, null, null, 0, null, null],
  pumpedHydro: [2.0, 0.02, 0, 60, null, null, 0, 2030, null],
  nuclear: [7.0, 0.12, 10, 60, 0.33, null, 0.012, 2035, null],
  fusion: [12.0, 0.2, 10, 40, 0.33, null, 0.012, 2040, null],
  importElectricity: [0.5, 0.005, 70, 40, null, null, 0, 2030, null],
  importFossil: [0.9, 0.02, 5, 30, 0.4, 'FuelOil', 0.65, null, null],
  importClean: [0.9, 0.02, 5, 30, 0.4, 'CleanFuel', 0.05, 2030, null],
  hydrogenImport: [1.0, 0.025, 4, 30, 0.5, 'Hydrogen', 0.05, 2032, null],
  hydrogenPower: [1.1, 0.025, 4, 30, 0.55, 'Hydrogen', 0.05, 2033, null],
  hydrogenGreen: [1.2, 0.03, 0, 20, 0.65, 'Electricity', 0.03, 2030, null],
  hydrogenBlue: [1.5, 0.05, 2, 25, 0.7, 'NaturalGas', 0.2, 2031, null],
  wte: [6.0, 0.15, 20, 30, 0.25, 'Waste', 0.3, 2028, null],
  other: [1.0, 0.03, 10, 30, 0.4, 'FuelOil', 0.5, null, null],
};

/** מוסיף למקור את הנתונים הכלכליים שלו. */
function withEcon(s: SupplySource): SupplySource {
  const e = ECON[s.key];
  if (!e) throw new Error(`no economics for ${s.key}`);
  const [capex, fixed, varMWh, life, eff, fuel, mtPerTWh, earliest, profile] = e;
  const out: SupplySource = {
    ...s,
    capitalCost: capex,
    fixedCost: fixed,
    variableCost: varMWh / 3.6e9,
    operatingLife: life,
    emissionFactor: (mtPerTWh * KG_PER_MT) / J_PER_TWH,
  };
  if (eff !== null) out.efficiency = eff;
  if (fuel !== null) out.inputFuel = fuel;
  if (earliest !== null) out.earliestYear = earliest;
  if (profile !== null) out.profile = profile;
  return out;
}

function main() {
  for (const lvl of ['low', 'medium', 'high']) {
    const p = `src/data/scenarios/demand-${lvl}.json`;
    const f = read(p);
    if (f.schema !== SCHEMA_VERSION_V1) continue;
    const d = migrateDemandV1(DemandFileSchemaV1.parse(f).data);
    writeFileSync(p, render('demand', f.savedAt, d as unknown as Record<string, unknown>, 'sectors'));
  }
  const supplyFiles = [
    ...['reference', 'declared', 'tested'].map((x) => `src/data/policies/supply-${x}.json`),
    ...['low', 'medium', 'high'].flatMap((d) =>
      ['reference', 'declared', 'tested'].map((x) => `src/data/scenarios/supply-${d}-${x}.json`),
    ),
  ];
  for (const p of supplyFiles) {
    const f = read(p);
    if (f.schema !== SCHEMA_VERSION_V1) continue;
    const s = migrateSupplyV1(SupplyFileSchemaV1.parse(f).data);
    s.sources = s.sources.map(withEcon);
    writeFileSync(p, render('supply', f.savedAt, s as unknown as Record<string, unknown>, 'sources'));
  }
  {
    const p = 'src/data/baseline-projects.json';
    const f = read(p);
    if (f.schema === SCHEMA_VERSION_V1) {
      const data = migrateProjectsV1(ProjectsFileSchemaV1.parse(f).data);
      writeFileSync(p, JSON.stringify({ ...f, schema: 'energy-dashboard/v2', data }, null, 2) + '\n');
    }
  }
  {
    const p = 'src/data/planPresets.json';
    const f = read(p);
    if (f.declared.solar.slopeGW !== undefined) {
      const out: Record<string, unknown> = {
        $comment:
          'Scenario-planning rule parameters per supply policy (sample values), SI: W, W per year, fractions. solar.base is filled from the declared policy template\'s base-year solar. Read by src/data/scenarioPlan.ts and by the Python backend.',
      };
      for (const pol of ['reference', 'declared', 'tested']) {
        const v1 = ScenarioPlanParamsSchemaV1.parse({ ...f[pol], solar: { baseGW: 0, ...f[pol].solar } });
        const { solar, ...rest } = migratePlanParamsV1(v1);
        out[pol] = { solar: { slope: solar.slope }, ...rest };
      }
      writeFileSync(p, JSON.stringify(out, null, 2) + '\n');
    }
  }
  console.log('data files are v2 / SI');
}

main();
