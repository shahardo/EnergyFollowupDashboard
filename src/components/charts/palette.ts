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
  heatCoolResidential: '#748ffc',
  heatCoolCommercial: '#66d9e8',
  industrialHeat: '#9775fa',
  transportPrivate: '#40c057',
  transportPublic: '#69db7c',
  transportFreight: '#2f9e44',
  transportAgri: '#a9e34b',
  transportHeavy: '#5c940d',
  /** תחבורה דלקים (כשהתחבורה מפוצלת לחשמל ודלקים). */
  transportFuel: '#2b8a3e',
};

/** The colour of each supply category (a group of sources, see `sourceCategories` in `data/catalog.ts`). */
export const categoryColors: Record<string, string> = {
  gas: '#868e96',
  coal: '#495057',
  solar: '#fab005',
  wind: '#38d9a9',
  geothermal: '#e8590c',
  storage: '#be4bdb',
  nuclear: '#f03e3e',
  fusion: '#0b7285',
  importElectricity: '#4dabf7',
  hydrogen: '#15aabf',
  fuels: '#845ef7',
  other: '#a68a64',
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
  fusion: '#0b7285',
  importElectricity: '#4dabf7',
  importFossil: '#845ef7',
  importClean: '#20c997',
  hydrogenImport: '#3bc9db',
  gasCcs: '#5f7f8f',
  solarRooftop: '#ffe066',
  csp: '#ff922b',
  pumpedHydro: '#9c36b5',
  hydrogenPower: '#1098ad',
  hydrogenGreen: '#66d9e8',
  hydrogenBlue: '#4263eb',
  wte: '#a68a64',
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

/** `#rrggbb` (or `#rgb`) → [h 0..360, s 0..1, l 0..1]; anything else → null. */
function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h6 = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h6.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** [h, s, l] → `#rrggbb`. */
function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * n shades of one colour, dark to light (hex): the items of an expanded group, so they read as one family. The
 * lightness spreads over a window around the base (kept inside 18%..85%); one shade is the colour itself.
 */
export function shadesOf(color: string, n: number): string[] {
  const hsl = hexToHsl(color);
  if (!hsl || n <= 1) return Array.from({ length: Math.max(n, 0) }, () => color);
  const [h, s, l] = hsl;
  const span = Math.min(0.42, 0.11 * (n - 1));
  const lo = Math.max(0.18, Math.min(l - span * 0.45, 0.85 - span));
  return Array.from({ length: n }, (_, i) => hslToHex(h, s, lo + (span * i) / (n - 1)));
}
