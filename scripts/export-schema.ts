/**
 * כותב את סכמות ה-Zod כ-JSON Schema (backend/tests/zod-schema.json), כדי שבדיקת ה-Python תוודא שמודלי
 * ה-Pydantic (backend/energy_model/schema.py) זהים להן. הרצה: npm run schema. בדיקת vitest נכשלת אם הקובץ ישן.
 */
import { writeFileSync } from 'node:fs';
import { schemaExport, SCHEMA_EXPORT_PATH } from '../src/schema/export';

writeFileSync(SCHEMA_EXPORT_PATH, JSON.stringify(schemaExport(), null, 2) + '\n');
