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

/** The rotating triangle (points to the end of the line when closed, down when open). */
function Triangle() {
  return (
    <svg className={classes.triangle} width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 1 L9 5 L2 9 Z" fill="currentColor" />
    </svg>
  );
}

/**
 * A bare triangle handle that expands / collapses something (e.g. a group row in a parameter panel). When
 * `expandable` is false it keeps its width but shows nothing, so rows stay aligned.
 */
export function DisclosureHandle({
  opened,
  onToggle,
  label,
  expandable = true,
}: {
  opened: boolean;
  onToggle: () => void;
  label: string;
  expandable?: boolean;
}) {
  if (!expandable) return <span className={classes.spacer} aria-hidden />;
  return (
    <UnstyledButton
      className={`${classes.handle} ${classes.bare}`}
      onClick={onToggle}
      aria-expanded={opened}
      aria-label={label}
      title={label}
    >
      <Triangle />
    </UnstyledButton>
  );
}

/** A handle with a triangle and a label that toggles something elsewhere (e.g. a group in a chart). */
export function DisclosureToggle({ label, opened, onToggle }: { label: ReactNode; opened: boolean; onToggle: () => void }) {
  return (
    <UnstyledButton className={classes.handle} onClick={onToggle} aria-expanded={opened}>
      <Triangle />
      {label}
    </UnstyledButton>
  );
}

/** A collapsible section: a handle with a rotating triangle and a title, and the content in a Collapse. */
export function Disclosure({ label, opened, onToggle, extra, children }: Props) {
  const id = useId();
  return (
    <div>
      <UnstyledButton className={classes.handle} onClick={onToggle} aria-expanded={opened} aria-controls={id}>
        <Triangle />
        <span>{label}</span>
        {extra}
      </UnstyledButton>
      <Collapse in={opened} id={id}>
        {children}
      </Collapse>
    </div>
  );
}
