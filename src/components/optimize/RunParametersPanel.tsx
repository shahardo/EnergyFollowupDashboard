import { Button, Group, Loader, ScrollArea, SegmentedControl, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useState } from 'react';
import { api, type RunParameters } from '../../api/client';
import { he } from '../../i18n/he';
import { toCsv } from '../../io/csvExport';
import { downloadText } from '../../io/download';
import { Disclosure } from '../controls/Disclosure';
import { cellText, paramTable, type Cell, type ParamSection, type TechGroup } from './paramTables';

const SECTIONS: ParamSection[] = ['system', 'demand', 'technologies', 'fuels'];
const GROUPS: TechGroup[] = ['all', 'supply', 'endUse', 'import', 'blend'];
/** מספרים ומזהים (בלי עברית) נכתבים משמאל לימין, מיושרים לימין כמו שאר העמודה. */
const isLtr = (c: Cell) => c !== null && (typeof c === 'number' || !/[\u0590-\u05FF]/.test(c));

/**
 * פאנל מתקפל עם הפרמטרים שהמודל קיבל בהרצה (נשמרים בשרת עם ההרצה): מערכת, ביקוש לפי שנה, טכנולוגיות
 * (עלויות, אורך חיים, גבולות...) ודלקים. נטען רק כשנפתח, ושוב כשההרצה המוצגת מתחלפת.
 */
export function RunParametersPanel({ runId }: { runId: string }) {
  const t = he.optimize.params;
  const [opened, setOpened] = useState(false);
  const [params, setParams] = useState<{ id: string; data: RunParameters } | null>(null);
  const [failed, setFailed] = useState(false);
  const [section, setSection] = useState<ParamSection>('technologies');
  const [group, setGroup] = useState<TechGroup>('supply');

  const loaded = params?.id === runId ? params.data : null;
  useEffect(() => {
    if (!opened || loaded) return;
    let live = true;
    setFailed(false);
    api
      .getParameters(runId)
      .then((data) => live && setParams({ id: runId, data }))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [opened, loaded, runId]);

  const table = useMemo(() => (loaded ? paramTable(loaded, section, group) : null), [loaded, section, group]);

  const csv = () => {
    if (!table) return;
    downloadText(`osemosys-parameters-${section}.csv`, toCsv([table.head, ...table.rows.map((r) => r.map((c) => c ?? ''))]), 'text/csv').catch(
      (e) => notifications.show({ color: 'red', message: e instanceof Error ? e.message : String(e) }),
    );
  };

  return (
    <Disclosure label={t.title} opened={opened} onToggle={() => setOpened((o) => !o)}>
      <Text size="xs" c="dimmed" mt={4} mb="xs">
        {t.hint}
      </Text>
      {failed ? (
        <Text size="sm" c="red">
          {t.error}
        </Text>
      ) : !table ? (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            {t.loading}
          </Text>
        </Group>
      ) : (
        <>
          <Group gap="sm" mb="xs" wrap="wrap">
            <SegmentedControl
              size="xs"
              value={section}
              onChange={(v) => setSection(v as ParamSection)}
              data={SECTIONS.map((s) => ({ value: s, label: t.sections[s] }))}
            />
            {section === 'technologies' && (
              <SegmentedControl
                size="xs"
                value={group}
                onChange={(v) => setGroup(v as TechGroup)}
                data={GROUPS.map((g) => ({ value: g, label: t.groups[g] }))}
              />
            )}
            <Button size="compact-xs" variant="default" onClick={csv} ms="auto">
              {t.csv}
            </Button>
          </Group>
          <ScrollArea.Autosize mah={460} type="auto" offsetScrollbars>
            <Table striped highlightOnHover stickyHeader withTableBorder withColumnBorders fz="xs" verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  {table.head.map((h, i) => (
                    <Table.Th
                      key={i}
                      style={{ whiteSpace: i === 0 || section === 'demand' ? 'nowrap' : undefined, minWidth: i === 0 ? 120 : 64 }}
                    >
                      {h}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {table.rows.map((row, r) => (
                  <Table.Tr key={r} fw={section === 'demand' && r === table.rows.length - 1 ? 700 : undefined}>
                    {row.map((c, i) => (
                      <Table.Td
                        key={i}
                        style={{
                          whiteSpace: 'nowrap',
                          ...(isLtr(c) ? { direction: 'ltr', textAlign: 'right' } : {}),
                        }}
                      >
                        {cellText(c)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        </>
      )}
    </Disclosure>
  );
}
