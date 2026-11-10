/** ריבוע צבע קטן ו"שקוע" שמסמן תרחיש (בבורר התרחיש וברשימה שלו). */
export function ScenarioSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: 3,
        flexShrink: 0,
        background: color,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.18)',
      }}
    />
  );
}
