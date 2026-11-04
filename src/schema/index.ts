import { z } from 'zod';

// ---------- ביקוש ----------
export const SectorDemandSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  baseTWh: z.number().nonnegative(),
  growthPct: z.number(),
  curve: z.enum(['linear', 'exp', 's']),
  sMidYear: z.number().int().optional(),
  efficiencyPct: z.number().min(0).max(100),
  loadFactor: z.number().gt(0).max(1),
});

export const DemandScenarioSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    baseYear: z.number().int(),
    horizonYear: z.number().int(),
    sectors: z.array(SectorDemandSchema),
  })
  .refine((s) => s.horizonYear > s.baseYear, {
    message: 'שנת האופק חייבת להיות אחרי שנת הבסיס',
  });

// ---------- היצע ----------
export const CapacityPointSchema = z.object({
  year: z.number().int(),
  gw: z.number().nonnegative(),
});

export const SupplySourceSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  enabled: z.boolean(),
  renewable: z.boolean(),
  capacityGW: z.array(CapacityPointSchema).min(1),
  capacityFactor: z.number().min(0).max(1),
  capacityCredit: z.number().min(0).max(1),
  retireYear: z.number().int().optional(),
  /** תקרת הספק כוללת (GW) שההשלמה האוטומטית לא תעבור. אם לא מוגדר, אין תקרה. */
  maxGW: z.number().nonnegative().optional(),
});

export const SupplyScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  demandScenarioRef: z.string().optional(),
  sources: z.array(SupplySourceSchema),
  fillPriority: z.array(z.string()),
});

// ---------- מעקב ----------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD');

export const ProjectStatusSchema = z.enum(['on-track', 'at-risk', 'delayed']);

export const MilestoneSchema = z.object({
  name: z.string(),
  date: isoDate,
  done: z.boolean(),
});

export const ProjectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** מפנה ל-SupplySource.key */
    channel: z.string().min(1),
    owner: z.string(),
    mw: z.number().nonnegative(),
    plannedStart: isoDate,
    plannedEnd: isoDate,
    progressPct: z.number().min(0).max(100),
    /** אם מוגדר, גובר על הסטטוס המחושב. */
    status: ProjectStatusSchema.optional(),
    milestones: z.array(MilestoneSchema),
    notes: z.string().optional(),
  })
  .refine((p) => p.plannedEnd >= p.plannedStart, {
    message: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
    path: ['plannedEnd'],
  });

export const ProjectsDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** תאריך "נכון ל-": קו ה"היום" בגאנט, והתאריך שלפיו מחושב הסטטוס. */
  asOf: isoDate,
  projects: z.array(ProjectSchema),
});

// ---------- מעטפת הקובץ השמור ----------
export const SCHEMA_VERSION = 'energy-dashboard/v1' as const;

export const scenarioFileSchema = <T extends z.ZodTypeAny>(kind: ScenarioKind, data: T) =>
  z.object({
    schema: z.literal(SCHEMA_VERSION),
    kind: z.literal(kind),
    savedAt: z.string(),
    data,
  });

export const DemandFileSchema = scenarioFileSchema('demand', DemandScenarioSchema);
export const SupplyFileSchema = scenarioFileSchema('supply', SupplyScenarioSchema);
export const ProjectsFileSchema = scenarioFileSchema('projects', ProjectsDataSchema);

export type SectorDemand = z.infer<typeof SectorDemandSchema>;
export type DemandScenario = z.infer<typeof DemandScenarioSchema>;
export type CapacityPoint = z.infer<typeof CapacityPointSchema>;
export type SupplySource = z.infer<typeof SupplySourceSchema>;
export type SupplyScenario = z.infer<typeof SupplyScenarioSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type ProjectsData = z.infer<typeof ProjectsDataSchema>;
export type ScenarioKind = 'demand' | 'supply' | 'projects';
