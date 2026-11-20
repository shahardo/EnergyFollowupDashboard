/**
 * הקטלוג המשותף (catalog.json): כל מגזר, תת-מגזר ומקור של הדשבורד, והמזהה שלו במודל OSeMOSYS שנבנה מהנתונים
 * של הדשבורד (סחורת ביקוש לכל מגזר, טכנולוגיה לכל מקור). גם השרת (Python) קורא את אותו קובץ.
 */
import { z } from 'zod';
import catalogJson from './catalog.json';

const SplitSchema = z.object({ elec: z.number(), fuels: z.number(), gas: z.number() });
const SubSchema = z.object({ key: z.string(), commodity: z.string(), elecShare: z.number(), fuelShare: z.number() });
const SectorSchema = z.object({
  key: z.string(),
  commodity: z.string().optional(),
  /** מגזר שפוצל ממגזר אחר (חימום וקירור, חום תעשייתי): המגזר המקורי והחלק שעבר. */
  parent: z.string().optional(),
  split: SplitSchema.optional(),
  /** סוג השימוש הסופי (energySystem.json): fixed = בלי מעבר בין נשאים; האחרים: המודל בוחר את התמהיל. */
  kind: z.enum(['fixed', 'heatCool', 'industrialHeat', 'transport']),
  subSectors: z.array(SubSchema).optional(),
});
const SourceSchema = z.object({
  key: z.string(),
  /** הטכנולוגיה במודל. */
  technology: z.string(),
  /** מה היא מייצרת (ברירת מחדל: חשמל); none = אגירה, שתורמת רק הספק זמין. */
  output: z.enum(['Electricity', 'Hydrogen', 'none']).optional(),
});
const CatalogSchema = z.object({
  sectors: z.array(SectorSchema),
  sources: z.array(SourceSchema),
});

/** מגזר בקטלוג. */
export type CatalogSector = z.infer<typeof SectorSchema>;
/** מקור בקטלוג. */
export type CatalogSource = z.infer<typeof SourceSchema>;

/** הקטלוג, נבדק בטעינה. */
export const catalog = CatalogSchema.parse(catalogJson);

/** המגזרים שפוצלו ממגזר אחר, עם החלק שעבר מכל נשא. */
export const splitSectors = catalog.sectors.filter(
  (s): s is CatalogSector & { parent: string; split: z.infer<typeof SplitSchema> } => !!s.parent && !!s.split,
);
