import { Badge, Button, Group, Paper, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRef, type ReactNode } from 'react';
import { he } from '../../i18n/he';
import { downloadImage, downloadText, safeFileStem } from '../../io/download';
import { StackedAreaChart, type ChartHandle } from './StackedAreaChart';

type ChartProps = Parameters<typeof StackedAreaChart>[0];

interface Props {
  title: string;
  /** שם הקובץ בלי סיומת. */
  fileStem: string;
  /** מחושב רק כשלוחצים על CSV. */
  csv: () => string;
  chart: Omit<ChartProps, 'ref'>;
  /** שם התרחיש שנטען להשוואה, אם יש. */
  compareName?: string;
  footer?: ReactNode;
}

export function ChartCard({ title, fileStem, csv, chart, compareName, footer }: Props) {
  const ref = useRef<ChartHandle>(null);
  const t = he.export;
  const stem = safeFileStem(fileStem);

  const run = (p: Promise<unknown>) =>
    p.catch((e) =>
      notifications.show({ color: 'red', title: t.error, message: e instanceof Error ? e.message : String(e) }),
    );

  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" mb="xs" gap="xs" wrap="wrap">
        <Group gap="xs" wrap="wrap">
          <Title order={2} fz="md">
            {title}
          </Title>
          {compareName && (
            <Badge variant="light" color="blue" title={he.compare.chipTitle}>
              {he.compare.chip(compareName)}
            </Badge>
          )}
        </Group>
        <Group gap={6}>
          <Button size="compact-xs" variant="default" onClick={() => run(downloadText(`${stem}.csv`, csv(), 'text/csv'))}>
            {t.csv}
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => {
              const url = ref.current?.toPng();
              if (url) run(downloadImage(`${stem}.png`, url));
            }}
          >
            {t.png}
          </Button>
        </Group>
      </Group>
      <StackedAreaChart ref={ref} {...chart} />
      {footer && (
        <Text size="xs" c="dimmed" mt={4}>
          {footer}
        </Text>
      )}
    </Paper>
  );
}
