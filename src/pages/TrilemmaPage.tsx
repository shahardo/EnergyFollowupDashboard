import { SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { PyramidCard } from '../components/trilemma/PyramidCard';
import { TrilemmaCard } from '../components/trilemma/TrilemmaCard';
import { he } from '../i18n/he';
import { DEFAULT_VIEW } from '../model/pyramid';
import { trilemmaHue } from '../model/trilemma';
import { useScoreOf } from '../store/priorityStore';
import { useSupplyStore } from '../store/supplyStore';
import { useUiStore } from '../store/uiStore';

/**
 * טאב טרילמת האנרגיה: תיבה לכל ערוץ אספקה (כל מקורות תרחיש ההיצע, גם כבויים), לפי סדר לוח ההיצע.
 * התצוגה (uiStore.trilemmaView, בורר "תצוגה" בסרגל העליון): 2D = משולש הטרילמה, והיישימות בדהיית הצבע;
 * 3D = פירמידה שהיישימות היא הגובה שלה.
 */
export function TrilemmaPage() {
  const sources = useSupplyStore((s) => s.scenario.sources);
  const pyramid = useUiStore((s) => s.trilemmaView === '3d');
  const scoreFor = useScoreOf();
  const t = he.trilemma;
  // כיוון המבט על הפירמידות (סיבוב והטיה): משותף לכל התיבות (גרירה באחת מסובבת את כולן), לא נשמר
  const [view, setView] = useState(DEFAULT_VIEW);
  return (
    <Stack gap="sm">
      <div>
        <Title order={2} fz="md">
          {pyramid ? t.pyramidTitle : t.title}
        </Title>
        <Text size="xs" c="dimmed">
          {pyramid ? t.pyramidHint : t.hint}
        </Text>
      </div>
      <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
        {sources.map((s, i) => {
          const props = { label: s.label, score: scoreFor(s.key), hue: trilemmaHue(i, sources.length) };
          return pyramid ? (
            <PyramidCard key={s.key} {...props} view={view} onView={setView} />
          ) : (
            <TrilemmaCard key={s.key} {...props} />
          );
        })}
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {t.sample} {he.sampleData}
      </Text>
    </Stack>
  );
}
