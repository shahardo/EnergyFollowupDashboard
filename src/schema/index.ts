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

export const MEASURE_MAX_PCT = 40;

export const MeasuresSchema = z.object({
  /** התייעלות אנרגטית: אותו שירות באנרגיה פחותה (מכשירים, מבנים, מנועים). */
  efficiencyPct: z.number().min(0).max(MEASURE_MAX_PCT),
  /** חיסכון באנרגיה: צריכה פחותה (התנהגות, שימור). */
  savingPct: z.number().min(0).max(MEASURE_MAX_PCT),
});

/** תרחישי הביקוש המוכנים: נמוך, בינוני, גבוה. */
export const DemandPresetSchema = z.enum(['low', 'medium', 'high']);
/** תרחישי ההיצע המוכנים: ייחוס (המשך עסקים כרגיל), מדיניות מוצהרת, מדיניות נבחנת (אפס פליטות נטו). */
export const SupplyPresetSchema = z.enum(['reference', 'declared', 'tested']);

export const DemandScenarioSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** התרחיש המוכן שהקובץ שייך אליו. אם חסר, נטען לתרחיש הפעיל. */
    preset: DemandPresetSchema.optional(),
    baseYear: z.number().int(),
    horizonYear: z.number().int(),
    sectors: z.array(SectorDemandSchema),
    /** הפחתות ביקוש: האחוז שמושג בשנת האופק, ונבנה בהדרגה משנת הבסיס. אם חסר, אין הפחתה. */
    measures: MeasuresSchema.optional(),
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
  /** התרחיש המוכן שהקובץ שייך אליו. אם חסר, נטען לתרחיש הפעיל. */
  preset: SupplyPresetSchema.optional(),
  /** תרחיש הביקוש שההיצע הותאם לו. יחד עם preset הוא קובע את המקום של התרחיש. אם חסר: הביקוש הנבחר. */
  demandPreset: DemandPresetSchema.optional(),
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

/**
 * משימה בגאנט מקורות האנרגיה (שם היסטורי: פרויקט). כל משימה שייכת לשורה של מקור האנרגיה
 * שב-channel; משימות חופפות באותו מקור מקבלות כמה נתיבים.
 */
export const ProjectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** מפנה ל-SupplySource.key */
    channel: z.string().min(1),
    owner: z.string(),
    /** הספק (MW). אופציונלי: משימות (תכנון, מכרז…) בלי הספק. */
    mw: z.number().nonnegative().optional(),
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
export type Measures = z.infer<typeof MeasuresSchema>;
export type DemandPreset = z.infer<typeof DemandPresetSchema>;
export type SupplyPreset = z.infer<typeof SupplyPresetSchema>;
export type CapacityPoint = z.infer<typeof CapacityPointSchema>;
export type SupplySource = z.infer<typeof SupplySourceSchema>;
export type SupplyScenario = z.infer<typeof SupplyScenarioSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type ProjectsData = z.infer<typeof ProjectsDataSchema>;
export type ScenarioKind = 'demand' | 'supply' | 'projects';
