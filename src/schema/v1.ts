/**
 * סכמות Zod של פורמט v1 (TWh / GW / אחוזים), רק כדי לקרוא קבצים ומצב שמור ישנים ולהמיר אותם ל-v2
 * (io/migrateV1.ts). לא בשימוש במקום אחר.
 */
import { z } from 'zod';

// ---------- ביקוש ----------
/**
 * תת-מגזר (למשל תחבורה פרטית): חלק מערך הבסיס של המגזר בחשמל ובביקוש שאינו חשמל, וצמיחה משלו
 * (אם חסרה: של המגזר). סך המגזר הוא סכום תתי-המגזרים.
 */
export const SubSectorSchemaV1 = z.object({
  key: z.string().min(1),
  label: z.string(),
  /** החלק מחשמל הבסיס של המגזר (0..1). */
  elecShare: z.number().min(0).max(1),
  /** החלק מהביקוש שאינו חשמל של המגזר (0..1), קבוע לאורך השנים. */
  fuelShare: z.number().min(0).max(1),
  /** צמיחה שנתית (%) של החשמל בתת-המגזר. אם חסר: של המגזר. */
  growthPct: z.number().optional(),
});

/** מגזר ביקוש: ערך בסיס, קצב וצורת צמיחה, התייעלות שנתית ו-load factor (ליחס אנרגיה–שיא). */
export const SectorDemandSchemaV1 = z.object({
  key: z.string().min(1),
  label: z.string(),
  baseTWh: z.number().nonnegative(),
  growthPct: z.number(),
  curve: z.enum(['linear', 'exp', 's']),
  sMidYear: z.number().int().optional(),
  efficiencyPct: z.number().min(0).max(100),
  loadFactor: z.number().gt(0).max(1),
  /** ביקוש שאינו חשמל (אנרגיה סופית). אם חסר, המגזר חשמלי בלבד. */
  nonElectric: z
    .object({
      /** דלקים (נוזליים, גפ"מ) בשנת הבסיס, TWh אנרגיה סופית. */
      fuelsTWh: z.number().nonnegative(),
      /** גז טבעי בשימוש ישיר (לא לייצור חשמל) בשנת הבסיס, TWh. */
      gasTWh: z.number().nonnegative(),
      /** צמיחה שנתית (%) של הביקוש שאינו חשמל, ריבית דריבית. */
      growthPct: z.number(),
      /** TWh דלק שנחסכים על כל TWh חשמל שנוסף במגזר (חשמול, למשל רכב חשמלי). */
      electrifyOffset: z.number().nonnegative().optional(),
    })
    .optional(),
  /** תתי-מגזרים (למשל חמשת סוגי התחבורה). אם יש, החשמל של המגזר הוא סכומם. */
  subSectors: z.array(SubSectorSchemaV1).optional(),
});

/** האחוז המרבי של התייעלות או חיסכון. */
export const MEASURE_MAX_PCT = 40;

/** הפחתות הביקוש: האחוז שמושג בשנת האופק. */
export const MeasuresSchemaV1 = z.object({
  /** התייעלות אנרגטית: אותו שירות באנרגיה פחותה (מכשירים, מבנים, מנועים). */
  efficiencyPct: z.number().min(0).max(MEASURE_MAX_PCT),
  /** חיסכון באנרגיה: צריכה פחותה (התנהגות, שימור). */
  savingPct: z.number().min(0).max(MEASURE_MAX_PCT),
});

/** תרחישי הביקוש המוכנים: נמוך, בינוני, גבוה. */
export const DemandPresetSchemaV1 = z.enum(['low', 'medium', 'high']);
/** תרחישי ההיצע המוכנים: ייחוס (המשך עסקים כרגיל), מדיניות מוצהרת, מדיניות נבחנת (אפס פליטות נטו). */
export const SupplyPresetSchemaV1 = z.enum(['reference', 'declared', 'tested']);

/** תרחיש ביקוש: טווח השנים, המגזרים וההפחתות. */
export const DemandScenarioSchemaV1 = z
  .object({
    id: z.string(),
    name: z.string(),
    /** התרחיש המוכן שהקובץ שייך אליו. אם חסר, נטען לתרחיש הפעיל. */
    preset: DemandPresetSchemaV1.optional(),
    baseYear: z.number().int(),
    horizonYear: z.number().int(),
    sectors: z.array(SectorDemandSchemaV1),
    /** הפחתות ביקוש: האחוז שמושג בשנת האופק, ונבנה בהדרגה משנת הבסיס. אם חסר, אין הפחתה. */
    measures: MeasuresSchemaV1.optional(),
  })
  .refine((s) => s.horizonYear > s.baseYear, {
    message: 'שנת האופק חייבת להיות אחרי שנת הבסיס',
  });

// ---------- תכנון תרחישים ----------
const Year = z.number().int().min(2000).max(2100);
/** מקור שעולה בקצב קבוע (GW בשנה) משנת התחלה. */
const SlopeSchemaV1 = z.object({ start: Year, slopeGW: z.number().min(0) });
/** מקור שנכנס בקשת עולה (rampYears) ומתייצב על קצב בנייה קבוע (GW בשנה). */
const RampSchemaV1 = z.object({ start: Year, rateGW: z.number().min(0), rampYears: z.number().min(0) });
/** דלק שחלקו מביקוש הדלקים עולה לינארית משנת ההתחלה ועד sharePct בשנת האופק. */
const ShareSchemaV1 = z.object({ start: Year, sharePct: z.number().min(0).max(100) });

/** הפרמטרים של טאב תכנון התרחישים: כללי מילוי האספקה (חשמל ודלקים). */
export const ScenarioPlanParamsSchemaV1 = z.object({
  /** סולארי: ההספק בשנת הבסיס ותוספת שנתית קבועה. */
  solar: z.object({ baseGW: z.number().min(0), slopeGW: z.number().min(0) }),
  /** פאנלים בנצילות 30%. */
  solar30: SlopeSchemaV1,
  /** פאנלים בנצילות 40%. */
  solar40: SlopeSchemaV1,
  /** יבוא חשמל: stepGW בשנת ההתחלה, ועוד stepGW כל stepYears, עד steps מדרגות. */
  importElectricity: z.object({
    start: Year,
    stepGW: z.number().min(0),
    stepYears: z.number().int().min(1),
    steps: z.number().int().min(1),
  }),
  geothermal: RampSchemaV1,
  fusion: RampSchemaV1,
  cleanFuels: ShareSchemaV1,
  hydrogen: ShareSchemaV1,
});

// ---------- היצע ----------
/** נקודת עוגן של הספק מותקן: GW בשנה מסוימת; בין הנקודות יש אינטרפולציה לינארית. */
export const CapacityPointSchemaV1 = z.object({
  year: z.number().int(),
  gw: z.number().nonnegative(),
});

/** מקור אספקה: נקודות ההספק, CF (לאנרגיה), capacity credit (לשיא) ושנת הוצאה משימוש. */
export const SupplySourceSchemaV1 = z.object({
  key: z.string().min(1),
  label: z.string(),
  enabled: z.boolean(),
  renewable: z.boolean(),
  capacityGW: z.array(CapacityPointSchemaV1).min(1),
  capacityFactor: z.number().min(0).max(1),
  capacityCredit: z.number().min(0).max(1),
  retireYear: z.number().int().optional(),
  /** תקרת הספק כוללת (GW) שההשלמה האוטומטית לא תעבור. אם לא מוגדר, אין תקרה. */
  maxGW: z.number().nonnegative().optional(),
});

/** תרחיש היצע: המקורות וסדר ההשלמה האוטומטית (fillPriority, מפתחות מקורות). */
export const SupplyScenarioSchemaV1 = z.object({
  id: z.string(),
  name: z.string(),
  /** התרחיש המוכן שהקובץ שייך אליו. אם חסר, נטען לתרחיש הפעיל. */
  preset: SupplyPresetSchemaV1.optional(),
  /** תרחיש הביקוש שההיצע הותאם לו. יחד עם preset הוא קובע את המקום של התרחיש. אם חסר: הביקוש הנבחר. */
  demandPreset: DemandPresetSchemaV1.optional(),
  /** מזהה תרחיש הביקוש שההיצע נבנה עבורו (לאזהרת אי-התאמה). */
  demandScenarioRef: z.string().optional(),
  sources: z.array(SupplySourceSchemaV1),
  fillPriority: z.array(z.string()),
  /** כללי המילוי של טאב תכנון התרחישים (שיפועים, שנות התחלה, תמהיל הדלקים). אם חסר: של התרחיש המוכן. */
  planParams: ScenarioPlanParamsSchemaV1.optional(),
});

// ---------- מעקב ----------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD');

/** סטטוס משימה: בזמן, בסיכון, מתעכב. */
export const ProjectStatusSchemaV1 = z.enum(['on-track', 'at-risk', 'delayed']);

/** אבן דרך של משימה. */
export const MilestoneSchemaV1 = z.object({
  name: z.string(),
  date: isoDate,
  done: z.boolean(),
});

/**
 * משימה בגאנט מקורות האנרגיה (שם היסטורי: פרויקט). כל משימה שייכת לשורה של מקור האנרגיה
 * שב-channel; משימות חופפות באותו מקור מקבלות כמה נתיבים.
 */
export const ProjectSchemaV1 = z
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
    status: ProjectStatusSchemaV1.optional(),
    milestones: z.array(MilestoneSchemaV1),
    notes: z.string().optional(),
  })
  .refine((p) => p.plannedEnd >= p.plannedStart, {
    message: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
    path: ['plannedEnd'],
  });

/** רשימת המשימות, עם תאריך "נכון ל-" אחד לכולן. */
export const ProjectsDataSchemaV1 = z.object({
  id: z.string(),
  name: z.string(),
  /** תאריך "נכון ל-": קו ה"היום" בגאנט, והתאריך שלפיו מחושב הסטטוס. */
  asOf: isoDate,
  projects: z.array(ProjectSchemaV1),
});

// ---------- טרילמה ותעדוף ----------
/** ציון בסולם 0..10 בציר טרילמה. */
const AxisScore = z.number().min(0).max(10);
/** ציוני טרילמת האנרגיה של ערוץ אספקה: שלושה צירים בסולם 0..10, ויישימות באחוזים. */
export const TrilemmaScoreSchemaV1 = z.object({
  /** ביטחון אנרגטי: אמינות, עצמאות, עמידות לשיבושים. */
  security: AxisScore,
  /** נגישות כלכלית: עלות לצרכן ולמשק. */
  affordability: AxisScore,
  /** קיימות סביבתית: פליטות, קרקע, השפעה על הסביבה. */
  sustainability: AxisScore,
  /** יישימות בישראל (0..100): עד כמה הערוץ מעשי בטווח התכנון. */
  feasibilityPct: z.number().min(0).max(100),
});

// ---------- מעטפת הקובץ השמור ----------
/** גרסת פורמט הקובץ. שינוי לא תואם מחייב גרסה חדשה והמרה ב-io/scenarioFiles.ts. */
export const SCHEMA_VERSION_V1 = 'energy-dashboard/v1' as const;

/** המעטפת של קובץ שמור: גרסה, סוג, זמן שמירה, והנתונים עצמם. */
const scenarioFileSchema = <T extends z.ZodTypeAny>(kind: 'demand' | 'supply' | 'projects', data: T) =>
  z.object({
    schema: z.literal(SCHEMA_VERSION_V1),
    kind: z.literal(kind),
    savedAt: z.string(),
    data,
  });

/** סכמות הקבצים השמורים לפי סוג. */
export const DemandFileSchemaV1 = scenarioFileSchema('demand', DemandScenarioSchemaV1);
export const SupplyFileSchemaV1 = scenarioFileSchema('supply', SupplyScenarioSchemaV1);
export const ProjectsFileSchemaV1 = scenarioFileSchema('projects', ProjectsDataSchemaV1);

// הטיפוסים של v1.
export type DemandScenarioV1 = z.infer<typeof DemandScenarioSchemaV1>;
export type SupplyScenarioV1 = z.infer<typeof SupplyScenarioSchemaV1>;
export type SupplySourceV1 = z.infer<typeof SupplySourceSchemaV1>;
export type ProjectsDataV1 = z.infer<typeof ProjectsDataSchemaV1>;
export type ScenarioPlanParamsV1 = z.infer<typeof ScenarioPlanParamsSchemaV1>;
export type TrilemmaScoreV1 = z.infer<typeof TrilemmaScoreSchemaV1>;
