/** צבעים קבועים, כדי שהגרפים יהיו עקביים. מפתח חדש של מגזר או מקור מקבל צבע כאן. */

/** צבע לכל מגזר ביקוש. */
export const sectorColors: Record<string, string> = {
  residential: '#4c6ef5',
  commercial: '#15aabf',
  industry: '#7950f2',
  transport: '#40c057',
  ai: '#f76707',
  water: '#228be6',
  agri: '#82c91e',
  pa: '#e64980',
  /** תחבורה דלקים (כשהתחבורה מפוצלת לחשמל ודלקים). */
  transportFuel: '#2b8a3e',
};

/** צבע לכל מקור אנרגיה סופי (נשא) בגרף הביקוש. */
export const carrierColors: Record<string, string> = {
  electricity: '#1c7ed6',
  fuels: '#e8590c',
  gas: '#868e96',
};

/** צבע לכל מקור אספקה (גם בגאנט ובטרילמה). */
export const sourceColors: Record<string, string> = {
  gas: '#868e96',
  coal: '#495057',
  solar: '#fab005',
  solar30: '#ffd43b',
  solar40: '#f08c00',
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
  other: '#adb5bd',
  gasDirect: '#ced4da',
};

/** נורית הצבע של כל תרחיש ביקוש בבורר התרחיש. */
export const demandPresetColors: Record<string, string> = { low: '#40c057', medium: '#fab005', high: '#fa5252' };
/** נורית הצבע של כל מדיניות היצע בבורר התרחיש. */
export const supplyPresetColors: Record<string, string> = {
  reference: '#868e96',
  declared: '#228be6',
  tested: '#12b886',
};

// הפחתות הביקוש: שני צבעים רחוקים זה מזה (כחול כהה / ענבר), ושונים מהמגזרים שבראש הערימה.
/** צבע ההתייעלות האנרגטית בפס ההפחתות. */
export const EFFICIENCY_COLOR = '#1864ab';
/** צבע החיסכון באנרגיה בפס ההפחתות. */
export const SAVING_COLOR = '#e67700';

const fallback = ['#e64980', '#20c997', '#fd7e14', '#5c7cfa'];
/** הצבע של מפתח, או צבע חלופי לפי המיקום כשהמפתח לא מוכר. */
export const colorFor = (map: Record<string, string>, key: string, i: number) =>
  map[key] ?? fallback[i % fallback.length];
