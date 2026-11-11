/** צבע קבוע לכל מגזר ולכל מקור, כדי שהגרפים יהיו עקביים. */
export const sectorColors: Record<string, string> = {
  residential: '#4c6ef5',
  commercial: '#15aabf',
  industry: '#7950f2',
  transport: '#40c057',
  ai: '#f76707',
  water: '#228be6',
  agri: '#82c91e',
  pa: '#e64980',
};

export const sourceColors: Record<string, string> = {
  gas: '#868e96',
  coal: '#495057',
  solar: '#fab005',
  wind: '#38d9a9',
  storage: '#be4bdb',
  lng: '#5f3dc4',
  geothermal: '#e8590c',
  nuclear: '#f03e3e',
  fusion: '#e64980',
  importElectricity: '#4dabf7',
  importFossil: '#845ef7',
  importClean: '#20c997',
  hydrogenImport: '#3bc9db',
  /** "יבוא" מגרסה קודמת, לפני הפיצול */
  import: '#4dabf7',
  other: '#adb5bd',
};

/** תרחישי הביקוש וההיצע: ריבוע הצבע בבורר התרחיש. */
export const demandPresetColors: Record<string, string> = { low: '#40c057', medium: '#fab005', high: '#fa5252' };
export const supplyPresetColors: Record<string, string> = {
  reference: '#868e96',
  declared: '#228be6',
  tested: '#12b886',
};

/** הפחתות הביקוש: התייעלות וחיסכון */
// שני צבעים רחוקים זה מזה (כחול כהה / ענבר), ושונים מהמגזרים שבראש הערימה.
export const EFFICIENCY_COLOR = '#1864ab';
export const SAVING_COLOR = '#e67700';

const fallback = ['#e64980', '#20c997', '#fd7e14', '#5c7cfa'];
export const colorFor = (map: Record<string, string>, key: string, i: number) =>
  map[key] ?? fallback[i % fallback.length];
