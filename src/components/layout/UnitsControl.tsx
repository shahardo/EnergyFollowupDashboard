import type { KeyboardEvent } from 'react';
import { he } from '../../i18n/he';
import { useUiStore, type Units } from '../../store/uiStore';
import classes from './UnitsControl.module.css';

type Group = 'energy' | 'electricity' | 'gas';

/** הכפתורים לפי הסדר (ב-RTL: הראשון הוא הימני ביותר): אנרגיה, חשמל, גז. גם סדר המעבר בחיצים. */
const BUTTONS: { value: Units; group: Group }[] = [
  { value: 'toe', group: 'energy' },
  { value: 'twh', group: 'electricity' },
  { value: 'gw', group: 'electricity' },
  { value: 'bcm', group: 'gas' },
];
const GROUPS: Group[] = ['energy', 'electricity', 'gas'];
const colorVar = (g: Group) => `var(--unit-${g})`;

/** בורר היחידות של הגרפים, מקובץ לקטגוריות אנרגיה / חשמל / גז, כל אחת בצבע משלה. */
export function UnitsControl({ className }: { className?: string }) {
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
    <div className={`${classes.root} ${className ?? ''}`} role="radiogroup" aria-label={t.units} onKeyDown={onKeyDown}>
      {GROUPS.map((group) => (
        <div
          key={group}
          className={classes.group}
          role="group"
          aria-label={t.unitGroups[group]}
          style={{ ['--unit-color' as string]: colorVar(group) }}
        >
          <div className={classes.caption} aria-hidden>
            {t.unitGroups[group]}
          </div>
          <div className={classes.buttons}>
            {BUTTONS.filter((b) => b.group === group).map(({ value }) => (
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
                onClick={() => setUnits(value)}
              >
                {label[value]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
