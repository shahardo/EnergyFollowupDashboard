/**
 * "נורית" התרחיש: מלבן צבעוני שקוע עם ברק, כמו נורית LED בכפתור פיזי.
 * מופיע בבורר התרחיש ובצד שמאל של כל שורה ברשימה שלו.
 */
export function ScenarioSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 18,
        height: 9,
        borderRadius: 3,
        flexShrink: 0,
        border: '1px solid rgba(0,0,0,0.35)',
        // ברק בחצי העליון, מעל צבע הנורית
        background: `linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.12) 45%, rgba(0,0,0,0.12) 100%), ${color}`,
        // שקוע: צל פנימי למעלה, קו אור מתחת לשקע, והילה עדינה בצבע הנורית
        boxShadow: `inset 0 1px 2px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.75), 0 0 4px ${color}66`,
      }}
    />
  );
}
