import { Paper, Text, Title } from '@mantine/core';
import { he } from '../i18n/he';

export function TrackingPage() {
  return (
    <Paper withBorder p="lg" radius="md">
      <Title order={2} fz="md" mb="xs">
        {he.tracking.title}
      </Title>
      <Text c="dimmed">{he.tracking.comingSoon}</Text>
    </Paper>
  );
}
