import { SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { TrilemmaCard } from '../components/trilemma/TrilemmaCard';
import { scoreFor } from '../data/trilemma';
import { he } from '../i18n/he';
import { trilemmaHue } from '../model/trilemma';
import { useSupplyStore } from '../store/supplyStore';

/** טאב טרילמת האנרגיה: קובייה לכל ערוץ אספקה (כל מקורות תרחיש ההיצע, גם כבויים), לפי סדר לוח ההיצע. */
export function TrilemmaPage() {
  const sources = useSupplyStore((s) => s.scenario.sources);
  const t = he.trilemma;
  return (
    <Stack gap="sm">
      <div>
        <Title order={2} fz="md">
          {t.title}
        </Title>
        <Text size="xs" c="dimmed">
          {t.hint}
        </Text>
      </div>
      <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
        {sources.map((s, i) => (
          <TrilemmaCard key={s.key} label={s.label} score={scoreFor(s.key)} hue={trilemmaHue(i, sources.length)} />
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {t.sample} {he.sampleData}
      </Text>
    </Stack>
  );
}
