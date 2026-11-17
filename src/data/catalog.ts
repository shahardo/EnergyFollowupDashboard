/**
 * הקטלוג המשותף (catalog.json): כל מגזר, תת-מגזר ומקור של הדשבורד, והמזהים שלו במודל OSeMOSYS.
 * גם השרת (Python) קורא את אותו קובץ; הבדיקות בשני הצדדים מוודאות ששום דבר לא חסר באף אחד מהם.
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
  subSectors: z.array(SubSchema).optional(),
  addedToOsemosys: z.boolean().optional(),
});
const SourceSchema = z.object({
  key: z.string(),
  technologies: z.array(z.string()),
  addedToOsemosys: z.boolean().optional(),
});
const CatalogSchema = z.object({
  osemosysSource: z.object({ repo: z.string(), commit: z.string() }),
  sectors: z.array(SectorSchema),
  sources: z.array(SourceSchema),
  infrastructurePrefixes: z.array(z.string()),
  infrastructureTechnologies: z.array(z.string()),
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
