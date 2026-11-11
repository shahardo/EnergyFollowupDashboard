/**
 * דוגמת פסים אלכסוניים (canvas) למילוי ב-ECharts: { image, repeat: 'repeat' }.
 * fill: צבע הרקע מתחת לפסים; fillAlpha: האטימות שלו; strokeAlpha: אטימות הפסים עצמם.
 */
const cache = new Map<string, HTMLCanvasElement>();

export function stripes(color: string, fill = color, fillAlpha = 0.35, strokeAlpha = 1): HTMLCanvasElement | string {
  if (typeof document === 'undefined') return color;
  const key = `${color}|${fill}|${fillAlpha}|${strokeAlpha}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 8, 8);
    ctx.globalAlpha = strokeAlpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(8, 0);
    ctx.moveTo(-2, 2);
    ctx.lineTo(2, -2);
    ctx.moveTo(6, 10);
    ctx.lineTo(10, 6);
    ctx.stroke();
    cache.set(key, c);
  }
  return c;
}

export const pattern = (color: string, fill?: string, fillAlpha?: number, strokeAlpha?: number) => ({
  image: stripes(color, fill, fillAlpha, strokeAlpha),
  repeat: 'repeat' as const,
});
