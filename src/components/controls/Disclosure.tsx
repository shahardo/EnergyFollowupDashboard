import { Collapse, UnstyledButton } from '@mantine/core';
import { useId, type ReactNode } from 'react';
import classes from './Disclosure.module.css';

interface Props {
  label: ReactNode;
  opened: boolean;
  onToggle: () => void;
  /** תוכן נוסף בשורת הידית (למשל מונה), אחרי הכותרת. */
  extra?: ReactNode;
  children: ReactNode;
}

/** קטע מתקפל: ידית עם משולש שמסתובב (לסוף השורה כשסגור, למטה כשפתוח) וכותרת, והתוכן ב-Collapse. */
export function Disclosure({ label, opened, onToggle, extra, children }: Props) {
  const id = useId();
  return (
    <div>
      <UnstyledButton className={classes.handle} onClick={onToggle} aria-expanded={opened} aria-controls={id}>
        <svg className={classes.triangle} width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 1 L9 5 L2 9 Z" fill="currentColor" />
        </svg>
        <span>{label}</span>
        {extra}
      </UnstyledButton>
      <Collapse in={opened} id={id}>
        {children}
      </Collapse>
    </div>
  );
}
