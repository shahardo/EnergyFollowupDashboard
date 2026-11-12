import { Badge, Group, NumberInput, Progress, Table, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import type { IdealResult } from '../../model/priority';
import { sourceCapacity } from '../../model/supply';
import type { SupplyScenario, TrilemmaScore } from '../../schema';
import { usePriorityStore } from '../../store/priorityStore';
import { fmt } from '../../utils/format';
import { colorFor, sourceColors } from '../charts/palette';
import { ColorSquare } from '../controls/inputs';
import { AXIS_COLORS } from './PriorityControls';

interface Props {
  /** תרחיש ההיצע הפעיל: השמות, הצבעים והצי הקיים. */
  scenario: SupplyScenario;
  result: IdealResult;
  scoreOf: (key: string) => TrilemmaScore;
  maxGW: Record<string, number | null>;
  baseYear: number;
  horizonYear: number;
}

/** צירי הטרילמה בסדר העמודות (כמו בפאנל המשקלות). */
const SCORE_AXES = ['sustainability', 'affordability', 'security'] as const;

/** הערך של NumberInput כמספר, או null כשהשדה ריק. */
const numOrNull = (v: string | number): number | null => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * טבלת הדירוג: שורה לכל ערוץ, לפי הציון. הציונים, היישימות והתקרה ניתנים לעריכה (נשמרים בחנות התעדוף);
 * בצד: הצי הקיים, ההספק בשנת האופק בעקומה האידאלית, ומצב הערוץ (נבנה / מושבת מוקדם / מתחת לסף).
 */
export function RankingTable({ scenario, result, scoreOf, maxGW, baseYear, horizonYear }: Props) {
  const setScore = usePriorityStore((s) => s.setScore);
  const setMaxGW = usePriorityStore((s) => s.setMaxGW);
  const t = he.priority;
  const byKey = new Map(scenario.sources.map((s, i) => [s.key, { s, i }]));
  const idealByKey = new Map(result.scenario.sources.map((s) => [s.key, s]));
  const cell = { size: 'xs' as const, hideControls: true, w: 58, styles: { input: { textAlign: 'center' as const } } };

  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped highlightOnHover verticalSpacing={4} horizontalSpacing={6} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t.col.rank}</Table.Th>
            <Table.Th>{t.col.channel}</Table.Th>
            <Table.Th miw={130}>{t.col.merit}</Table.Th>
            {SCORE_AXES.map((a) => (
              <Table.Th key={a} c={AXIS_COLORS[a]}>
                {t.col[a]}
              </Table.Th>
            ))}
            <Table.Th c={AXIS_COLORS.feasibility}>{t.col.feasibility}</Table.Th>
            <Table.Th>{t.col.maxGW}</Table.Th>
            <Table.Th>{t.col.existing(baseYear)}</Table.Th>
            <Table.Th>{t.col.horizon(horizonYear)}</Table.Th>
            <Table.Th>{t.col.state}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {result.ranking.map((r, rank) => {
            const entry = byKey.get(r.key);
            if (!entry) return null;
            const { s, i } = entry;
            const score = scoreOf(r.key);
            const ideal = idealByKey.get(r.key);
            const existing = sourceCapacity(s, baseYear);
            const atHorizon = ideal ? sourceCapacity(ideal, horizonYear) : 0;
            const added = result.addedGW[r.key] ?? 0;
            const state = r.retiring
              ? { color: 'red', text: t.state.retiring }
              : !r.eligible
                ? { color: 'gray', text: t.state.excluded }
                : added > 0.05
                  ? { color: 'teal', text: t.state.built(fmt(added)) }
                  : { color: 'gray', text: t.state.none };
            return (
              <Table.Tr key={r.key} style={r.eligible ? undefined : { opacity: 0.6 }}>
                <Table.Td>{rank + 1}</Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <ColorSquare color={colorFor(sourceColors, s.key, i)} />
                    <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>
                      {s.label}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={700} w={28} style={{ direction: 'ltr' }}>
                      {fmt(r.merit, 1)}
                    </Text>
                    <Progress value={r.merit * 10} size="sm" style={{ flex: 1 }} color="teal" aria-hidden />
                  </Group>
                </Table.Td>
                {SCORE_AXES.map((a) => (
                    <Table.Td key={a}>
                      <NumberInput
                        {...cell}
                        aria-label={t.edit(t.col[a], s.label)}
                        min={0}
                        max={10}
                        step={0.5}
                        decimalScale={1}
                        clampBehavior="strict"
                        value={score[a]}
                        onChange={(v) => {
                          const n = numOrNull(v);
                          if (n !== null) setScore(r.key, { [a]: n });
                        }}
                      />
                    </Table.Td>
                  ))}
                <Table.Td>
                  <NumberInput
                    {...cell}
                    aria-label={t.edit(t.col.feasibility, s.label)}
                    min={0}
                    max={100}
                    step={5}
                    decimalScale={0}
                    clampBehavior="strict"
                    value={score.feasibilityPct}
                    onChange={(v) => {
                      const n = numOrNull(v);
                      if (n !== null) setScore(r.key, { feasibilityPct: n });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    {...cell}
                    aria-label={t.edit(t.col.maxGW, s.label)}
                    min={0}
                    step={1}
                    decimalScale={1}
                    allowNegative={false}
                    placeholder="∞"
                    value={maxGW[r.key] ?? ''}
                    onChange={(v) => setMaxGW(r.key, numOrNull(v))}
                  />
                </Table.Td>
                <Table.Td style={{ direction: 'ltr', textAlign: 'right' }}>{fmt(existing)}</Table.Td>
                <Table.Td style={{ direction: 'ltr', textAlign: 'right' }} fw={600}>
                  {fmt(atHorizon)}
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color={state.color} style={{ whiteSpace: 'nowrap' }}>
                    {state.text}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
