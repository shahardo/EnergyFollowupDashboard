import { DemandFileSchema, ProjectsFileSchema, SupplyFileSchema } from '../schema';
import demandJson from './baseline-demand.json';
import projectsJson from './baseline-projects.json';
import supplyJson from './baseline-supply.json';

/** ערכי דוגמה בלבד. צריך לאמת אותם מול מקורות רשמיים לפני שמסתמכים עליהם. */
export const baselineDemand = DemandFileSchema.parse(demandJson).data;
export const baselineSupply = SupplyFileSchema.parse(supplyJson).data;
export const baselineProjects = ProjectsFileSchema.parse(projectsJson).data;
