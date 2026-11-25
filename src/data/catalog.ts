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
  /** The display category that groups the source in charts and panels (one of `sourceCategories`). */
  category: z.string(),
});
const CatalogSchema = z.object({
  sectors: z.array(SectorSchema),
  /** The supply categories, in display order. */
  sourceCategories: z.array(z.string()),
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

/** The supply categories in display order, each with its sources in catalogue order. */
export const sourceCategories: { key: string; sources: string[] }[] = catalog.sourceCategories.map((key) => ({
  key,
  sources: catalog.sources.filter((s) => s.category === key).map((s) => s.key),
}));

const categoryBySource = new Map(catalog.sources.map((s) => [s.key, s.category]));
/** The category of a source key; an unknown key is its own category. */
export const categoryOf = (sourceKey: string) => categoryBySource.get(sourceKey) ?? sourceKey;

const parentBySector = new Map(catalog.sectors.map((s) => [s.key, s.parent ?? s.key]));
/** The top-level sector of a sector key (a split sector's parent); an unknown key is its own top level. */
export const topSectorOf = (sectorKey: string) => parentBySector.get(sectorKey) ?? sectorKey;

/** The catalogue sector whose demand commodity (or one of whose sub-sectors' commodity) is `commodity`. */
export const sectorOfCommodity = (commodity: string): string | undefined =>
  catalog.sectors.find((s) => s.commodity === commodity || s.subSectors?.some((x) => x.commodity === commodity))?.key;
