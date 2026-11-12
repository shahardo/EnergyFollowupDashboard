/** התרחישים המוכנים (ערכי דוגמה), כפי שהם נטענים מקובצי ה-JSON ונבדקים בטעינה. */
import {
  DemandFileSchema,
  DemandPresetSchema,
  ProjectsFileSchema,
  SupplyFileSchema,
  SupplyPresetSchema,
  type DemandPreset,
  type DemandScenario,
  type SupplyPreset,
  type SupplyScenario,
} from '../schema';
import projectsJson from './baseline-projects.json';
import demandHigh from './scenarios/demand-high.json';
import demandLow from './scenarios/demand-low.json';
import demandMedium from './scenarios/demand-medium.json';
import supplyHighDeclared from './scenarios/supply-high-declared.json';
import supplyHighReference from './scenarios/supply-high-reference.json';
import supplyHighTested from './scenarios/supply-high-tested.json';
import supplyLowDeclared from './scenarios/supply-low-declared.json';
import supplyLowReference from './scenarios/supply-low-reference.json';
import supplyLowTested from './scenarios/supply-low-tested.json';
import supplyMediumDeclared from './scenarios/supply-medium-declared.json';
import supplyMediumReference from './scenarios/supply-medium-reference.json';
import supplyMediumTested from './scenarios/supply-medium-tested.json';

/** סדר התרחישים בתפריט. */
export const DEMAND_PRESETS: readonly DemandPreset[] = DemandPresetSchema.options;
/** סדר מדיניות ההיצע בתפריט. */
export const SUPPLY_PRESETS: readonly SupplyPreset[] = SupplyPresetSchema.options;

/** ערכי דוגמה בלבד. צריך לאמת אותם מול מקורות רשמיים לפני שמסתמכים עליהם. */
export const demandPresets: Record<DemandPreset, DemandScenario> = {
  low: DemandFileSchema.parse(demandLow).data,
  medium: DemandFileSchema.parse(demandMedium).data,
  high: DemandFileSchema.parse(demandHigh).data,
};

const supply = (json: unknown) => SupplyFileSchema.parse(json).data;
/**
 * תרחישי ההיצע: לכל תרחיש ביקוש, שלוש מדיניות שמותאמות לו כך שהביקוש מסופק בכל שנה.
 * נבנים מהתבניות ב-src/data/policies/ בעזרת `npm run fit:supply`.
 */
export const supplyPresets: Record<DemandPreset, Record<SupplyPreset, SupplyScenario>> = {
  low: { reference: supply(supplyLowReference), declared: supply(supplyLowDeclared), tested: supply(supplyLowTested) },
  medium: {
    reference: supply(supplyMediumReference),
    declared: supply(supplyMediumDeclared),
    tested: supply(supplyMediumTested),
  },
  high: {
    reference: supply(supplyHighReference),
    declared: supply(supplyHighDeclared),
    tested: supply(supplyHighTested),
  },
};

/** תרחישי ברירת המחדל, וגם הרשימה המלאה של המגזרים והמקורות (לעדכון תרחישים ישנים). */
export const DEFAULT_DEMAND_PRESET: DemandPreset = 'medium';
export const DEFAULT_SUPPLY_PRESET: SupplyPreset = 'declared';
export const baselineDemand = demandPresets[DEFAULT_DEMAND_PRESET];
export const baselineSupply = supplyPresets[DEFAULT_DEMAND_PRESET][DEFAULT_SUPPLY_PRESET];
/** משימות הדוגמה של גאנט המעקב (בדויות). */
export const baselineProjects = ProjectsFileSchema.parse(projectsJson).data;
