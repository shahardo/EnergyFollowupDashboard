import { expect, it } from 'vitest';
import exported from '../../backend/tests/zod-schema.json';
import { schemaExport } from './export';

// אחרי שינוי בסכמה מריצים `npm run schema`, ומעדכנים את המודל המקביל ב-backend/energy_model/schema.py.
it('the exported JSON Schema for the Python backend is up to date', () => {
  expect(exported).toEqual(JSON.parse(JSON.stringify(schemaExport())));
});
