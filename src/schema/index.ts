/**
 * סכמות Zod של כל הנתונים: המקור היחיד של הטיפוסים (z.infer), ובדיקת קבצים שנפתחים
 * ומצב שנשמר ב-localStorage.
 *
 * יחידות (פורמט v2): הכול ב-SI בסיסי, אנרגיה ב-J, הספק ב-W, CO₂ ב-kg, כסף ב-$, וחלקים, צמיחה, התייעלות
 * ויישימות כשברים (0.02 ולא 2%). ההמרה ליחידות תצוגה ב-model/units.ts. קבצים מפורמט v1 (TWh / GW / %)
 * מומרים בטעינה (io/migrateV1.ts).
 */
import { z } from 'zod';

const fraction = z.number().min(0).max(1);

// ---------- ביקוש ----------
/**
 * תת-מגזר (למשל תחבורה פרטית): חלק מערך הבסיס של המגזר בחשמל ובביקוש שאינו חשמל, וצמיחה משלו
 * (אם חסרה: של המגזר). סך המגזר הוא סכום תתי-המגזרים.
 */
export const SubSectorSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  /** החלק מחשמל הבסיס של המגזר (0..1). */
  elecShare: fraction,
  /** החלק מהביקוש שאינו חשמל של המגזר (0..1), קבוע לאורך השנים. */
  fuelShare: fraction,
  /** צמיחה שנתית (שבר לשנה) של החשמל בתת-המגזר. אם חסר: של המגזר. */
  growthRate: z.number().optional(),
});

/** מגזר ביקוש: ערך בסיס, קצב וצורת צמיחה, התייעלות שנתית ו-load factor (ליחס אנרגיה–שיא). */
export const SectorDemandSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  /** ביקוש החשמל בשנת הבסיס (J). */
  baseEnergy: z.number().nonnegative(),
  /** צמיחה שנתית (שבר לשנה). */
  growthRate: z.number(),
  curve: z.enum(['linear', 'exp', 's']),
  sMidYear: z.number().int().optional(),
  /** התייעלות שנתית של המגזר (שבר לשנה). */
  efficiencyRate: fraction,
  /** load factor: אנרגיה ממוצעת חלקי שיא (0..1]. */
  loadFactor: z.number().gt(0).max(1),
  /** ביקוש שאינו חשמל (אנרגיה סופית). אם חסר, המגזר חשמלי בלבד. */
  nonElectric: z
    .object({
      /** דלקים (נוזליים, גפ"מ) בשנת הבסיס (J, אנרגיה סופית). */
      fuels: z.number().nonnegative(),
      /** גז טבעי בשימוש ישיר (לא לייצור חשמל) בשנת הבסיס (J). */
      gas: z.number().nonnegative(),
      /** צמיחה שנתית (שבר לשנה), ריבית דריבית. */
      growthRate: z.number(),
      /** J דלק שנחסכים על כל J חשמל שנוסף במגזר (חשמול, למשל רכב חשמלי). */
      electrifyOffset: z.number().nonnegative().optional(),
    })
    .optional(),
  /** תתי-מגזרים (למשל חמשת סוגי התחבורה). אם יש, החשמל של המגזר הוא סכומם. */
  subSectors: z.array(SubSectorSchema).optional(),
});

/** השבר המרבי של התייעלות או חיסכון. */
export const MEASURE_MAX = 0.4;

/** הפחתות הביקוש: השבר שמושג בשנת האופק. */
export const MeasuresSchema = z.object({
  /** התייעלות אנרגטית: אותו שירות באנרגיה פחותה (מכשירים, מבנים, מנועים). */
  efficiency: z.number().min(0).max(MEASURE_MAX),
  /** חיסכון באנרגיה: צריכה פחותה (התנהגות, שימור). */
  saving: z.number().min(0).max(MEASURE_MAX),
});

/** תרחישי הביקוש המוכנים: נמוך, בינוני, גבוה. */
export const DemandPresetSchema = z.enum(['low', 'medium', 'high']);
/** תרחישי ההיצע המוכנים: ייחוס (המשך עסקים כרגיל), מדיניות מוצהרת, מדיניות נבחנת (אפס פליטות נטו). */
export const SupplyPresetSchema = z.enum(['reference', 'declared', 'tested']);

/** תרחיש ביקוש: טווח השנים, המגזרים וההפחתות. */
export const DemandScenarioSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** התרחיש המוכן שהקובץ שייך אליו. אם חסר, נטען לתרחיש הפעיל. */
    preset: DemandPresetSchema.optional(),
    baseYear: z.number().int(),
    horizonYear: z.number().int(),
    sectors: z.array(SectorDemandSchema),
    /** הפחתות ביקוש: השבר שמושג בשנת האופק, ונבנה בהדרגה משנת הבסיס. אם חסר, אין הפחתה. */
    measures: MeasuresSchema.optional(),
  })
  .refine((s) => s.horizonYear > s.baseYear, {
    message: 'שנת האופק חייבת להיות אחרי שנת הבסיס',
  });

// ---------- תכנון תרחישים ----------
const Year = z.number().int().min(2000).max(2100);
/** מקור שעולה בקצב קבוע (W בשנה) משנת התחלה. */
const SlopeSchema = z.object({ start: Year, slope: z.number().min(0) });
/** מקור שנכנס בקשת עולה (rampYears) ומתייצב על קצב בנייה קבוע (W בשנה). */
const RampSchema = z.object({ start: Year, rate: z.number().min(0), rampYears: z.number().min(0) });
/** דלק שחלקו מביקוש הדלקים עולה לינארית משנת ההתחלה ועד share בשנת האופק. */
const ShareSchema = z.object({ start: Year, share: fraction });

/** הפרמטרים של טאב תכנון התרחישים: כללי מילוי האספקה (חשמל ודלקים). */
export const ScenarioPlanParamsSchema = z.object({
  /** סולארי: ההספק בשנת הבסיס (W) ותוספת שנתית קבועה (W בשנה). */
  solar: z.object({ base: z.number().min(0), slope: z.number().min(0) }),
  /** פאנלים בנצילות 30%. */
  solar30: SlopeSchema,
  /** פאנלים בנצילות 40%. */
  solar40: SlopeSchema,
  /** יבוא חשמל: step (W) בשנת ההתחלה, ועוד step כל stepYears, עד steps מדרגות. */
  importElectricity: z.object({
    start: Year,
    step: z.number().min(0),
    stepYears: z.number().int().min(1),
    steps: z.number().int().min(1),
  }),
  geothermal: RampSchema,
  fusion: RampSchema,
  cleanFuels: ShareSchema,
  hydrogen: ShareSchema,
});

// ---------- היצע ----------
/** נקודת עוגן של הספק מותקן (W) בשנה מסוימת; בין הנקודות יש אינטרפולציה לינארית. */
export const CapacityPointSchema = z.object({
  year: z.number().int(),
  power: z.number().nonnegative(),
});

/**
 * מקור אספקה: נקודות ההספק, CF (לאנרגיה), capacity credit (לשיא) ושנת הוצאה משימוש, ובנוסף הנתונים
 * הכלכליים והטכניים שמודל OSeMOSYS צריך (אופציונליים; בתרחישים המוכנים יש לכולם ערכי דוגמה).
 */
export const SupplySourceSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  enabled: z.boolean(),
  renewable: z.boolean(),
  capacity: z.array(CapacityPointSchema).min(1),
  capacityFactor: fraction,
  capacityCredit: fraction,
  retireYear: z.number().int().optional(),
  /** תקרת הספק כוללת (W) שההשלמה האוטומטית לא תעבור. אם לא מוגדר, אין תקרה. */
  maxPower: z.number().nonnegative().optional(),
  /** עלות הון ($ ל-W הספק). */
  capitalCost: z.number().nonnegative().optional(),
  /** עלות תפעול קבועה ($ ל-W בשנה). */
  fixedCost: z.number().nonnegative().optional(),
  /** עלות תפעול משתנה ($ ל-J תפוקה; בלי מחיר הדלק, שמגיע ממקור הדלק). */
  variableCost: z.number().nonnegative().optional(),
  /** אורך חיים (שנים). */
  operatingLife: z.number().int().positive().optional(),
  /** נצילות: תפוקה חלקי אנרגיית הדלק (רק כשיש inputFuel; גם אנרגיה ראשונית בתצוגת שעט"ן). */
  efficiency: z.number().gt(0).optional(),
  /** הדלק שהמקור צורך (סחורה במודל, למשל NaturalGas). אם חסר: אין דלק (שמש, רוח, יבוא חשמל). */
  inputFuel: z.string().optional(),
  /** פליטות מחזור חיים (kg CO₂eq ל-J תפוקה). */
  emissionFactor: z.number().optional(),
  /** השנה הראשונה שבה אפשר לבנות הספק חדש (במודל). */
  earliestYear: z.number().int().optional(),
  /** צורת הזמינות לאורך היום והעונה: שם פרופיל מ-energySystem.json (ברירת מחדל: קבוע). */
  profile: z.string().optional(),
});

/** תרחיש היצע: המקורות וסדר ההשלמה האוטומטית (fillPriority, מפתחות מקורות). */
export const SupplyScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** התרחיש המוכן שהקובץ שייך אליו. אם חסר, נטען לתרחיש הפעיל. */
  preset: SupplyPresetSchema.optional(),
  /** תרחיש הביקוש שההיצע הותאם לו. יחד עם preset הוא קובע את המקום של התרחיש. אם חסר: הביקוש הנבחר. */
  demandPreset: DemandPresetSchema.optional(),
  /** מזהה תרחיש הביקוש שההיצע נבנה עבורו (לאזהרת אי-התאמה). */
  demandScenarioRef: z.string().optional(),
  sources: z.array(SupplySourceSchema),
  fillPriority: z.array(z.string()),
  /** כללי המילוי של טאב תכנון התרחישים (שיפועים, שנות התחלה, תמהיל הדלקים). אם חסר: של התרחיש המוכן. */
  planParams: ScenarioPlanParamsSchema.optional(),
});

// ---------- מעקב ----------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD');

/** סטטוס משימה: בזמן, בסיכון, מתעכב. */
export const ProjectStatusSchema = z.enum(['on-track', 'at-risk', 'delayed']);

/** אבן דרך של משימה. */
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
    /** הספק (W). אופציונלי: משימות (תכנון, מכרז…) בלי הספק. */
    power: z.number().nonnegative().optional(),
    plannedStart: isoDate,
    plannedEnd: isoDate,
    /** ההתקדמות (שבר, 0..1). */
    progress: fraction,
    /** אם מוגדר, גובר על הסטטוס המחושב. */
    status: ProjectStatusSchema.optional(),
    milestones: z.array(MilestoneSchema),
    notes: z.string().optional(),
  })
  .refine((p) => p.plannedEnd >= p.plannedStart, {
    message: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
    path: ['plannedEnd'],
  });

/** רשימת המשימות, עם תאריך "נכון ל-" אחד לכולן. */
export const ProjectsDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** תאריך "נכון ל-": קו ה"היום" בגאנט, והתאריך שלפיו מחושב הסטטוס. */
  asOf: isoDate,
  projects: z.array(ProjectSchema),
});

// ---------- טרילמה ותעדוף ----------
/** ציון בסולם 0..10 בציר טרילמה. */
const AxisScore = z.number().min(0).max(10);
/** ציוני טרילמת האנרגיה של ערוץ אספקה: שלושה צירים בסולם 0..10, ויישימות כשבר. */
export const TrilemmaScoreSchema = z.object({
  /** ביטחון אנרגטי: אמינות, עצמאות, עמידות לשיבושים. */
  security: AxisScore,
  /** נגישות כלכלית: עלות לצרכן ולמשק. */
  affordability: AxisScore,
  /** קיימות סביבתית: פליטות, קרקע, השפעה על הסביבה. */
  sustainability: AxisScore,
  /** יישימות בישראל (0..1): עד כמה הערוץ מעשי בטווח התכנון. */
  feasibility: fraction,
});

// ---------- מעטפת הקובץ השמור ----------
/** גרסת פורמט הקובץ. שינוי לא תואם מחייב גרסה חדשה והמרה ב-io/. */
export const SCHEMA_VERSION = 'energy-dashboard/v2' as const;

/** המעטפת של קובץ שמור: גרסה, סוג, זמן שמירה, והנתונים עצמם. */
const scenarioFileSchema = <T extends z.ZodTypeAny>(kind: ScenarioKind, data: T) =>
  z.object({
    schema: z.literal(SCHEMA_VERSION),
    kind: z.literal(kind),
    savedAt: z.string(),
    data,
  });

/** סכמות הקבצים השמורים לפי סוג. */
export const DemandFileSchema = scenarioFileSchema('demand', DemandScenarioSchema);
export const SupplyFileSchema = scenarioFileSchema('supply', SupplyScenarioSchema);
export const ProjectsFileSchema = scenarioFileSchema('projects', ProjectsDataSchema);

// הטיפוסים של כל הנתונים, נגזרים מהסכמות.
export type SectorDemand = z.infer<typeof SectorDemandSchema>;
export type SubSector = z.infer<typeof SubSectorSchema>;
export type DemandScenario = z.infer<typeof DemandScenarioSchema>;
export type Measures = z.infer<typeof MeasuresSchema>;
export type DemandPreset = z.infer<typeof DemandPresetSchema>;
export type SupplyPreset = z.infer<typeof SupplyPresetSchema>;
export type CapacityPoint = z.infer<typeof CapacityPointSchema>;
export type SupplySource = z.infer<typeof SupplySourceSchema>;
export type SupplyScenario = z.infer<typeof SupplyScenarioSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ProjectsData = z.infer<typeof ProjectsDataSchema>;
export type TrilemmaScore = z.infer<typeof TrilemmaScoreSchema>;
export type ScenarioPlanParams = z.infer<typeof ScenarioPlanParamsSchema>;
/** סוגי הקבצים השמורים. */
export type ScenarioKind = 'demand' | 'supply' | 'projects';
