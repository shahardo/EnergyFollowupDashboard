import { NumberInput, SegmentedControl, Stack, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import type { SectorDemand } from '../../schema';
import { numOr } from './inputs';

interface Props {
  sector: SectorDemand;
  baseYear: number;
  horizonYear: number;
  onChange: (patch: Partial<SectorDemand>) => void;
}

/** הפרמטרים המפורטים של מגזר (נפתחים מגלגל השיניים). */
export function SectorDetails({ sector, baseYear, horizonYear, onChange }: Props) {
  const t = he.demand;
  const midYear = sector.sMidYear ?? Math.round((baseYear + horizonYear) / 2);
  return (
    <Stack gap="xs" py="xs">
      <NumberInput
        size="xs"
        label={t.baseTWh}
        min={0}
        step={0.5}
        decimalScale={2}
        value={sector.baseTWh}
        onChange={(v) => onChange({ baseTWh: Math.max(0, numOr(v, sector.baseTWh)) })}
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
          value={midYear}
          onChange={(v) => onChange({ sMidYear: Math.round(numOr(v, midYear)) })}
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
        onChange={(v) => onChange({ efficiencyPct: Math.min(20, Math.max(0, numOr(v, sector.efficiencyPct))) })}
      />
      <NumberInput
        size="xs"
        label={t.loadFactor}
        min={0.05}
        max={1}
        step={0.05}
        decimalScale={2}
        value={sector.loadFactor}
        onChange={(v) => onChange({ loadFactor: Math.min(1, Math.max(0.05, numOr(v, sector.loadFactor))) })}
      />
    </Stack>
  );
}
