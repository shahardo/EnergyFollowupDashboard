import {
  DemandFileSchema,
  ProjectsFileSchema,
  SupplyFileSchema,
  type DemandPreset,
  type DemandScenario,
  type SupplyPreset,
  type SupplyScenario,
} from '../schema';
import projectsJson from './baseline-projects.json';
import demandHigh from './scenarios/demand-high.json';
import demandLow from './scenarios/demand-low.json';
import demandMedium from './scenarios/demand-medium.json';
import supplyDeclared from './scenarios/supply-declared.json';
import supplyReference from './scenarios/supply-reference.json';
import supplyTested from './scenarios/supply-tested.json';

/** סדר התרחישים בתפריט. */
export const DEMAND_PRESETS: readonly DemandPreset[] = ['low', 'medium', 'high'];
export const SUPPLY_PRESETS: readonly SupplyPreset[] = ['reference', 'declared', 'tested'];

/** ערכי דוגמה בלבד. צריך לאמת אותם מול מקורות רשמיים לפני שמסתמכים עליהם. */
export const demandPresets: Record<DemandPreset, DemandScenario> = {
  low: DemandFileSchema.parse(demandLow).data,
  medium: DemandFileSchema.parse(demandMedium).data,
  high: DemandFileSchema.parse(demandHigh).data,
};
export const supplyPresets: Record<SupplyPreset, SupplyScenario> = {
  reference: SupplyFileSchema.parse(supplyReference).data,
  declared: SupplyFileSchema.parse(supplyDeclared).data,
  tested: SupplyFileSchema.parse(supplyTested).data,
};

/** תרחישי ברירת המחדל, וגם הרשימה המלאה של המגזרים והמקורות (לעדכון תרחישים ישנים). */
export const DEFAULT_DEMAND_PRESET: DemandPreset = 'medium';
export const DEFAULT_SUPPLY_PRESET: SupplyPreset = 'declared';
export const baselineDemand = demandPresets[DEFAULT_DEMAND_PRESET];
export const baselineSupply = supplyPresets[DEFAULT_SUPPLY_PRESET];
export const baselineProjects = ProjectsFileSchema.parse(projectsJson).data;
