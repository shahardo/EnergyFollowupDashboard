/** עזרים קטנים לפקדים. */

/** הערך של NumberInput של Mantine (מספר, או מחרוזת כשהשדה ריק או באמצע הקלדה); fallback כשאין מספר. */
export const numOr = (v: string | number, fallback: number) => (typeof v === 'number' ? v : fallback);

/** ריבוע צבע קטן ליד שם של מגזר או מקור, כמו סמל במקרא. */
export function ColorSquare({ color }: { color: string }) {
  return <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />;
}
