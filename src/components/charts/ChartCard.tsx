import { Badge, Button, Group, Paper, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';
import { he } from '../../i18n/he';
import { downloadImage, downloadText } from '../../io/download';
import { safeFileStem } from '../../io/scenarioFiles';

interface Props {
  title: string;
  /** שם הקובץ בלי סיומת. */
  fileStem: string;
  /** מחושב רק כשלוחצים על CSV. */
  csv: () => string;
  /** מחזיר את הגרף כ-PNG (data URL). */
  toPng: () => string | null;
  /** שם התרחיש שנטען להשוואה, אם יש. */
  compareName?: string;
  /** פקדים בין הכותרת לכפתורי הייצוא (למשל בחירת התרחיש). */
  controls?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** כרטיס גרף: כותרת, פקדים, כפתורי CSV ו-PNG, תגית השוואה, הגרף והערת שוליים. */
export function ChartCard({ title, fileStem, csv, toPng, compareName, controls, footer, children }: Props) {
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
        {controls}
        <Group gap={6}>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => run(downloadText(`${stem}.csv`, csv(), 'text/csv'))}
          >
            {t.csv}
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => {
              const url = toPng();
              if (url) run(downloadImage(`${stem}.png`, url));
            }}
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
    </Paper>
  );
}
