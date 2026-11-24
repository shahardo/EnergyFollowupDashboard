import { Collapse, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useUiStore } from '../../store/uiStore';
import classes from './GroupCell.module.css';
import { ColorSquare } from './inputs';

/**
 * One group in a parameter panel: the group row (its own slider or summary, with a triangle handle in front) and,
 * when opened, its item rows indented below. One cell of the panel's grid.
 */
export function GroupCell({ head, opened, children }: { head: ReactNode; opened: boolean; children?: ReactNode }) {
  return (
    <div>
      {head}
      {children ? (
        <Collapse in={opened}>
          <div className={classes.children}>{children}</div>
        </Collapse>
      ) : null}
    </div>
  );
}

/**
 * A row without a slider (a legend-like row): handle / checkbox, colour, name, a dim note and, at full detail, a value
 * at the side. For items that aren't set here (e.g. gas, which grows with the fuels, or the fuel mix).
 */
export function SummaryRow({
  leading,
  color,
  label,
  note,
  side,
}: {
  leading?: ReactNode;
  color: string;
  label: string;
  note?: string;
  side?: string;
}) {
  const detail = useUiStore((s) => s.detail);
  return (
    <div className={classes.summary}>
      <div className={classes.summaryName}>
        {leading}
        <ColorSquare color={color} />
        <Text size="sm" fw={500} truncate="end" title={label}>
          {label}
        </Text>
        {note && detail !== 'low' && (
          <Text size="xs" c="dimmed" truncate="end">
            {note}
          </Text>
        )}
      </div>
      {side && detail === 'high' && (
        <Text size="sm" className={classes.side}>
          {side}
        </Text>
      )}
    </div>
  );
}
