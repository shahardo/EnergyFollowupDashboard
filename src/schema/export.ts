/** סכמות ה-Zod כ-JSON Schema, להשוואה מול מודלי ה-Pydantic של השרת. לא בשימוש בממשק. */
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  DemandScenarioSchema,
  ProjectsDataSchema,
  SupplyScenarioSchema,
  TrilemmaScoreSchema,
} from './index';

/** המקום של הקובץ. */
export const SCHEMA_EXPORT_PATH = 'backend/tests/zod-schema.json';

/** הסכמות הראשיות, בלי $ref (כל אובייקט מפורש במקומו). */
export const schemaExport = () => ({
  DemandScenario: zodToJsonSchema(DemandScenarioSchema, { $refStrategy: 'none' }),
  SupplyScenario: zodToJsonSchema(SupplyScenarioSchema, { $refStrategy: 'none' }),
  ProjectsData: zodToJsonSchema(ProjectsDataSchema, { $refStrategy: 'none' }),
  TrilemmaScore: zodToJsonSchema(TrilemmaScoreSchema, { $refStrategy: 'none' }),
});
