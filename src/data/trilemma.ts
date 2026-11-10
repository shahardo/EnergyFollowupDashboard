import type { TrilemmaScore } from '../model/trilemma';

/**
 * ציוני טרילמה לכל ערוץ אספקה (ערכי דוגמה, להערכה בלבד): ביטחון, נגישות כלכלית, קיימות (0..10),
 * ויישימות בישראל באחוזים. ערוץ שלא מופיע כאן מקבל את ערכי "אחר".
 */
export const trilemmaScores: Record<string, TrilemmaScore> = {
  gas: { security: 7, affordability: 8, sustainability: 4, feasibilityPct: 80 },
  lng: { security: 5, affordability: 5, sustainability: 4, feasibilityPct: 40 },
  coal: { security: 6, affordability: 6, sustainability: 1, feasibilityPct: 20 },
  solar: { security: 6, affordability: 9, sustainability: 9, feasibilityPct: 90 },
  wind: { security: 5, affordability: 6, sustainability: 9, feasibilityPct: 35 },
  geothermal: { security: 8, affordability: 4, sustainability: 9, feasibilityPct: 5 },
  storage: { security: 7, affordability: 5, sustainability: 8, feasibilityPct: 75 },
  nuclear: { security: 9, affordability: 3, sustainability: 8, feasibilityPct: 10 },
  fusion: { security: 9, affordability: 2, sustainability: 10, feasibilityPct: 2 },
  importElectricity: { security: 3, affordability: 6, sustainability: 6, feasibilityPct: 15 },
  importFossil: { security: 4, affordability: 5, sustainability: 2, feasibilityPct: 25 },
  importClean: { security: 4, affordability: 3, sustainability: 8, feasibilityPct: 10 },
  hydrogenImport: { security: 4, affordability: 2, sustainability: 9, feasibilityPct: 8 },
  other: { security: 5, affordability: 5, sustainability: 5, feasibilityPct: 50 },
};

export const scoreFor = (key: string): TrilemmaScore => trilemmaScores[key] ?? trilemmaScores.other;
