import { Collapse, SimpleGrid, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useUiStore } from '../../store/uiStore';
import classes from './GroupCell.module.css';
import { ColorSquare } from './inputs';

/**
 * A top-level panel row held to half the width (the first column of the same two-column grid the items use), so its
 * slider is as short as the items' sliders. One column on phones.
 */
export function HalfRow({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
      <div>{children}</div>
    </SimpleGrid>
  );
}

/**
 * One group in a parameter panel, as one row: the group row (its own slider or summary, with a triangle handle in
 * front, held to half the width by `HalfRow`) and, when opened, its items indented below in two columns (`columns = 1` when the items are
 * groups themselves, so each of them gets a full row too).
 */
export function GroupCell({
  head,
  opened,
  columns = 2,
  children,
}: {
  head: ReactNode;
  opened: boolean;
  columns?: 1 | 2;
  children?: ReactNode;
}) {
  return (
    <div>
      <HalfRow>{head}</HalfRow>
      {children ? (
        <Collapse in={opened}>
          <div className={classes.children}>
            <SimpleGrid cols={columns === 2 ? { base: 1, sm: 2 } : 1} spacing="lg" verticalSpacing={0}>
              {children}
            </SimpleGrid>
          </div>
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
