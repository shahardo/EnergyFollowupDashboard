/** כל השנים מ-from עד to, כולל שתיהן. */
export function yearRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

export { SECONDS_PER_YEAR } from './units';
