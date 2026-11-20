import { describe, expect, it } from 'vitest';
import { DEMAND_PRESETS, SUPPLY_PRESETS } from '../data/baseline';
import { goldenFor } from './goldens';

// קובצי הייחוס של מנוע ה-Python חייבים להתאים למנוע הנוכחי: אחרי שינוי בחישוב מריצים `npm run goldens`.
describe('goldens for the Python engine are up to date', () => {
  it.each(DEMAND_PRESETS.flatMap((d) => SUPPLY_PRESETS.map((p) => [d, p] as const)))('%s-%s', async (d, p) => {
    const file = (await import(`../../backend/tests/goldens/${d}-${p}.json`)).default;
    expect(file).toEqual(JSON.parse(JSON.stringify(goldenFor(d, p))));
  });
});
