import { Badge, Button, Group, Modal, Paper, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { he } from '../../i18n/he';
import { downloadImage, downloadText } from '../../io/download';
import { parseCsv } from '../../io/csvExport';
import { safeFileStem } from '../../io/scenarioFiles';

/** Whether a cell looks like a number (numbers: left-aligned, like the other foreign-language values in the dashboard). */
const isNumeric = (v: string) => v !== '' && !Number.isNaN(Number(v));

/**
 * The year column (always first in a table) is frozen across horizontal scroll, like the header row is across
 * vertical scroll. `right`, not `insetInlineStart`: numeric cells get their own `direction: ltr` (to left-align
 * them), which would flip what a logical property like insetInlineStart means for that cell; the page is always
 * RTL, so a fixed `right` is correct here.
 */
const STICKY_COL_STYLE: CSSProperties = {
  position: 'sticky',
  right: 0,
  background: 'var(--mantine-color-body)',
};

interface Props {
  title: string;
  /** A small control right next to the title (e.g. the view selector: sector/energy source). */
  titleControls?: ReactNode;
  /** File name without an extension. */
  fileStem: string;
  /** Computed only when CSV is clicked. */
  csv: () => string;
  /** Returns the chart as a PNG (data URL). */
  toPng: () => string | null;
  /** Name of the scenario loaded for comparison, if any. */
  compareName?: string;
  /** Controls between the title and the export buttons (e.g. a scenario picker). */
  controls?: ReactNode;
  /** Footnote below the chart. */
  footer?: ReactNode;
  children: ReactNode;
}

/** Chart card: title, controls, PNG/CSV/table buttons, compare badge, the chart and a footnote. */
export function ChartCard({ title, titleControls, fileStem, csv, toPng, compareName, controls, footer, children }: Props) {
  const t = he.export;
  const stem = safeFileStem(fileStem);
  const [tableRows, setTableRows] = useState<string[][] | null>(null);

  // Runs an export and shows an error, even one thrown before the promise (e.g. while building the CSV).
  const run = (task: () => Promise<unknown> | undefined) => {
    const fail = (e: unknown) =>
      notifications.show({ color: 'red', title: t.error, message: e instanceof Error ? e.message : String(e) });
    try {
      task()?.catch(fail);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" mb="xs" gap="xs" wrap="wrap">
        <Group gap={6} wrap="wrap">
          <Title order={2} fz="md">
            {title}
          </Title>
          {titleControls}
          {compareName && (
            <Badge variant="light" color="blue" title={he.compare.chipTitle}>
              {he.compare.chip(compareName)}
            </Badge>
          )}
        </Group>
        {controls}
        <Group gap={6}>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() =>
              run(() => {
                setTableRows(parseCsv(csv()));
                return undefined;
              })
            }
          >
            {t.table}
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => run(() => downloadText(`${stem}.csv`, csv(), 'text/csv'))}
          >
            {t.csv}
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() =>
              run(() => {
                const url = toPng();
                return url ? downloadImage(`${stem}.png`, url) : undefined;
              })
            }
          >
            {t.png}
          </Button>
        </Group>
      </Group>
      {children}
      {footer && (
        <Text size="xs" c="dimmed" mt={4}>
          {footer}
        </Text>
      )}
      <Modal opened={tableRows !== null} onClose={() => setTableRows(null)} title={title} size="auto" centered>
        {/* Scrolling (both directions) happens here, not on the modal: that's what keeps the year column (frozen relative to this) actually frozen. */}
        <div style={{ overflow: 'auto', maxHeight: '70vh', maxWidth: '100%' }}>
          <Table striped withTableBorder withColumnBorders stickyHeader fz="xs">
            {tableRows && tableRows.length > 0 && (
              <Table.Thead>
                <Table.Tr>
                  {tableRows[0].map((c, i) => (
                    <Table.Th key={i} style={i === 0 ? { ...STICKY_COL_STYLE, zIndex: 3 } : undefined}>
                      {c}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
            )}
            <Table.Tbody>
              {tableRows?.slice(1).map((r, ri) => (
                <Table.Tr key={ri}>
                  {r.map((c, ci) => (
                    <Table.Td
                      key={ci}
                      style={{
                        ...(isNumeric(c) ? { direction: 'ltr', textAlign: 'left' } : undefined),
                        ...(ci === 0 ? { ...STICKY_COL_STYLE, fontWeight: 700, zIndex: 1 } : undefined),
                      }}
                    >
                      {c}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      </Modal>
    </Paper>
  );
}
