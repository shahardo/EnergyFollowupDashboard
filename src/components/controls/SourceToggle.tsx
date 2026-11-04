import { ActionIcon, Button, Checkbox, Collapse, Group, NumberInput, Paper, Slider, Stack, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import type { SupplySource } from '../../schema';

interface Props {
  source: SupplySource;
  color: string;
  minYear: number;
  maxYear: number;
  onChange: (patch: Partial<SupplySource>) => void;
}

const MAX_GW = 60;
const num = (v: string | number, fallback: number) => (typeof v === 'number' ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function SourceToggle({ source, color, minYear, maxYear, onChange }: Props) {
  const t = he.supply;
  const anchors = source.capacityGW;
  const setAnchors = (capacityGW: SupplySource['capacityGW']) =>
    onChange({ capacityGW: [...capacityGW].sort((a, b) => a.year - b.year) });

  const addAnchor = () => {
    const last = anchors[anchors.length - 1];
    const year = clamp((last?.year ?? minYear) + 5, minYear, maxYear);
    setAnchors([...anchors, { year, gw: last?.gw ?? 0 }]);
  };

  return (
    <Paper withBorder p="sm" radius="md" style={{ opacity: source.enabled ? 1 : 0.65 }}>
      <Group justify="space-between" wrap="nowrap">
        <Checkbox
          checked={source.enabled}
          onChange={(e) => onChange({ enabled: e.currentTarget.checked })}
          label={
            <Group gap={8} wrap="nowrap">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
              <Text fw={600} size="sm">
                {source.label}
              </Text>
            </Group>
          }
        />
        {source.renewable && (
          <Text size="xs" c="teal">
            {t.renewableFlag}
          </Text>
        )}
      </Group>
      <Collapse in={source.enabled}>
        <Stack gap="xs" mt="sm">
          <Text size="xs" fw={500}>
            {t.anchors}
          </Text>
          {anchors.map((a, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="center">
              <NumberInput
                size="xs"
                w={76}
                aria-label={t.year}
                min={minYear}
                max={maxYear}
                value={a.year}
                onChange={(v) =>
                  setAnchors(anchors.map((p, j) => (j === i ? { ...p, year: Math.round(clamp(num(v, p.year), minYear, maxYear)) } : p)))
                }
              />
              <Slider
                style={{ flex: 1 }}
                thumbLabel={`${source.label} ${a.year} GW`}
                min={0}
                max={MAX_GW}
                step={0.1}
                value={a.gw}
                color={color}
                label={(v) => `${v} GW`}
                onChange={(gw) => setAnchors(anchors.map((p, j) => (j === i ? { ...p, gw } : p)))}
              />
              <Text size="xs" w={52} ta="end" style={{ direction: 'ltr' }}>
                {a.gw.toFixed(1)} GW
              </Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={t.removeAnchor}
                disabled={anchors.length <= 1}
                onClick={() => setAnchors(anchors.filter((_, j) => j !== i))}
              >
                ✕
              </ActionIcon>
            </Group>
          ))}
          <Button size="compact-xs" variant="light" onClick={addAnchor} style={{ alignSelf: 'flex-start' }}>
            + {t.addAnchor}
          </Button>
          <Group grow gap="xs">
            <NumberInput
              size="xs"
              label={t.capacityFactor}
              min={0}
              max={1}
              step={0.01}
              decimalScale={2}
              value={source.capacityFactor}
              onChange={(v) => onChange({ capacityFactor: clamp(num(v, source.capacityFactor), 0, 1) })}
            />
            <NumberInput
              size="xs"
              label={t.capacityCredit}
              min={0}
              max={1}
              step={0.05}
              decimalScale={2}
              value={source.capacityCredit}
              onChange={(v) => onChange({ capacityCredit: clamp(num(v, source.capacityCredit), 0, 1) })}
            />
          </Group>
          <NumberInput
            size="xs"
            label={t.maxGW}
            placeholder={t.noCap}
            min={0}
            step={0.5}
            decimalScale={2}
            value={source.maxGW ?? ''}
            onChange={(v) => onChange({ maxGW: typeof v === 'number' ? Math.max(0, v) : undefined })}
          />
          <NumberInput
            size="xs"
            label={t.retireYear}
            min={minYear}
            max={2100}
            allowDecimal={false}
            value={source.retireYear ?? ''}
            onChange={(v) => onChange({ retireYear: typeof v === 'number' ? Math.round(v) : undefined })}
          />
        </Stack>
      </Collapse>
    </Paper>
  );
}
