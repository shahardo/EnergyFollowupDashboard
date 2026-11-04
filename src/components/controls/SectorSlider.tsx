import { Collapse, Group, NumberInput, Paper, SegmentedControl, Slider, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { he } from '../../i18n/he';
import type { SectorDemand } from '../../schema';

interface Props {
  sector: SectorDemand;
  color: string;
  baseYear: number;
  horizonYear: number;
  onChange: (patch: Partial<SectorDemand>) => void;
}

const num = (v: string | number, fallback: number) => (typeof v === 'number' ? v : fallback);

export function SectorSlider({ sector, color, baseYear, horizonYear, onChange }: Props) {
  const [open, { toggle }] = useDisclosure(false);
  const t = he.demand;
  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          <Text fw={600} size="sm">
            {sector.label}
          </Text>
        </Group>
        <Text size="sm" c="dimmed" style={{ direction: 'ltr' }}>
          {sector.growthPct.toFixed(1)}%
        </Text>
      </Group>
      <Slider
        thumbLabel={`${t.growth}: ${sector.label}`}
        min={-5}
        max={25}
        step={0.5}
        value={sector.growthPct}
        onChange={(growthPct) => onChange({ growthPct })}
        label={(v) => `${v}%`}
        color={color}
      />
      <UnstyledButton onClick={toggle} mt={6}>
        <Text size="xs" c="dimmed">
          {open ? '▾' : '◂'} {t.advanced}
        </Text>
      </UnstyledButton>
      <Collapse in={open}>
        <Stack gap="xs" mt="xs">
          <NumberInput
            size="xs"
            label={t.baseTWh}
            min={0}
            step={0.5}
            decimalScale={2}
            value={sector.baseTWh}
            onChange={(v) => onChange({ baseTWh: Math.max(0, num(v, sector.baseTWh)) })}
          />
          <div>
            <Text size="xs" fw={500} mb={2}>
              {t.curve}
            </Text>
            <SegmentedControl
              size="xs"
              fullWidth
              value={sector.curve}
              onChange={(curve) => onChange({ curve: curve as SectorDemand['curve'] })}
              data={(['linear', 'exp', 's'] as const).map((c) => ({ value: c, label: t.curves[c] }))}
            />
          </div>
          {sector.curve === 's' && (
            <NumberInput
              size="xs"
              label={t.sMidYear}
              min={baseYear}
              max={horizonYear}
              value={sector.sMidYear ?? Math.round((baseYear + horizonYear) / 2)}
              onChange={(v) => onChange({ sMidYear: Math.round(num(v, baseYear)) })}
            />
          )}
          <NumberInput
            size="xs"
            label={t.efficiency}
            min={0}
            max={20}
            step={0.1}
            decimalScale={2}
            value={sector.efficiencyPct}
            onChange={(v) => onChange({ efficiencyPct: Math.min(20, Math.max(0, num(v, 0))) })}
          />
          <NumberInput
            size="xs"
            label={t.loadFactor}
            min={0.05}
            max={1}
            step={0.05}
            decimalScale={2}
            value={sector.loadFactor}
            onChange={(v) => onChange({ loadFactor: Math.min(1, Math.max(0.05, num(v, sector.loadFactor))) })}
          />
        </Stack>
      </Collapse>
    </Paper>
  );
}
