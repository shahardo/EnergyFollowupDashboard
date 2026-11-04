/** צבע קבוע לכל מגזר ולכל מקור, כדי שהגרפים יהיו עקביים. */
export const sectorColors: Record<string, string> = {
  residential: '#4c6ef5',
  commercial: '#15aabf',
  industry: '#7950f2',
  transport: '#40c057',
  ai: '#f76707',
  water: '#228be6',
  agri: '#82c91e',
};

export const sourceColors: Record<string, string> = {
  gas: '#868e96',
  coal: '#495057',
  solar: '#fab005',
  wind: '#38d9a9',
  storage: '#be4bdb',
  import: '#4dabf7',
  other: '#adb5bd',
};

const fallback = ['#e64980', '#20c997', '#fd7e14', '#5c7cfa'];
export const colorFor = (map: Record<string, string>, key: string, i: number) =>
  map[key] ?? fallback[i % fallback.length];
