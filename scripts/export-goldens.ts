/**
 * כותב את תוצאות הייחוס של מנוע ה-TypeScript לכל צירוף של תרחיש ביקוש ומדיניות היצע, כדי שמנוע ה-Python
 * (backend/energy_model) ייבדק מולן: backend/tests/goldens/<demand>-<policy>.json.
 * הרצה: npm run goldens. בדיקת vitest (goldens.test.ts) נכשלת אם הקבצים לא מעודכנים.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { goldenFor, GOLDEN_DIR } from '../src/model/goldens';
import { DEMAND_PRESETS, SUPPLY_PRESETS } from '../src/data/baseline';

mkdirSync(GOLDEN_DIR, { recursive: true });
for (const d of DEMAND_PRESETS) {
  for (const p of SUPPLY_PRESETS) {
    writeFileSync(`${GOLDEN_DIR}/${d}-${p}.json`, JSON.stringify(goldenFor(d, p)) + '\n');
    console.log(`${d}-${p}`);
  }
}
