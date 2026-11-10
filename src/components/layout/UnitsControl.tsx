import type { KeyboardEvent } from 'react';
import { he } from '../../i18n/he';
import { useUiStore, type Units } from '../../store/uiStore';
import classes from './UnitsControl.module.css';

type Group = 'energy' | 'electricity' | 'gas';

/** הכפתורים לפי הסדר (ב-RTL: הראשון הוא הימני ביותר): אנרגיה, חשמל, גז. */
const BUTTONS: { value: Units; group: Group }[] = [
  { value: 'toe', group: 'energy' },
  { value: 'twh', group: 'electricity' },
  { value: 'gw', group: 'electricity' },
  { value: 'bcm', group: 'gas' },
];
/** הכותרות מעל הכפתורים: עמודת ההתחלה ומספר העמודות של כל קטגוריה. */
const GROUPS: { group: Group; column: string }[] = [
  { group: 'energy', column: '1 / 2' },
  { group: 'electricity', column: '2 / 4' },
  { group: 'gas', column: '4 / 5' },
];
const colorVar = (g: Group) => `var(--unit-${g})`;

/** בורר היחידות של הגרפים, מקובץ לקטגוריות אנרגיה / חשמל / גז, כל אחת בצבע משלה. */
export function UnitsControl() {
  const units = useUiStore((s) => s.units);
  const setUnits = useUiStore((s) => s.setUnits);
  const t = he.topBar;
  const label: Record<Units, string> = { toe: t.toe, twh: t.twh, gw: t.gw, bcm: t.bcm };
  const title: Partial<Record<Units, string>> = { toe: t.toeTitle, bcm: t.bcmTitle };

  // חיצים: ב-RTL שמאלה = הכפתור הבא.
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = BUTTONS.findIndex((b) => b.value === units);
    const next = BUTTONS[(i + step + BUTTONS.length) % BUTTONS.length].value;
    setUnits(next);
    (e.currentTarget.querySelector(`[data-value="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div className={classes.root} role="radiogroup" aria-label={t.units} onKeyDown={onKeyDown}>
      {GROUPS.map(({ group, column }) => (
        <div
          key={group}
          className={classes.group}
          style={{ gridColumn: column, gridRow: 1, ['--unit-color' as string]: colorVar(group) }}
          aria-hidden
        >
          {t.unitGroups[group]}
        </div>
      ))}
      {BUTTONS.map(({ value, group }, i) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={units === value}
          tabIndex={units === value ? 0 : -1}
          data-value={value}
          data-active={units === value || undefined}
          title={title[value] ?? t.unitGroups[group]}
          className={classes.button}
          style={{ gridColumn: i + 1, gridRow: 2, ['--unit-color' as string]: colorVar(group) }}
          onClick={() => setUnits(value)}
        >
          {label[value]}
        </button>
      ))}
    </div>
  );
}
