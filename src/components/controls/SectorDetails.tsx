import { NumberInput, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import type { SectorDemand } from '../../schema';
import { round2 } from '../../model/math';
import { fromPct, fromTWh, toPct, toTWh } from '../../model/units';
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
        value={round2(toTWh(sector.baseEnergy))}
        onChange={(v) => onChange({ baseEnergy: fromTWh(Math.max(0, numOr(v, toTWh(sector.baseEnergy)))) })}
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
        value={toPct(sector.efficiencyRate)}
        onChange={(v) =>
          onChange({ efficiencyRate: fromPct(Math.min(20, Math.max(0, numOr(v, toPct(sector.efficiencyRate))))) })
        }
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
      {sector.subSectors?.length ? (
        <div>
          <Text size="xs" fw={500} mb={2}>
            {t.subSectors}
          </Text>
          <SimpleGrid cols={2} spacing="xs" verticalSpacing={4}>
            {sector.subSectors.map((sub) => (
              <NumberInput
                key={sub.key}
                size="xs"
                label={sub.label}
                description={t.subShare(`${Math.round(sub.elecShare * 100)}%`)}
                aria-label={t.subGrowthThumb(sub.label)}
                step={0.5}
                decimalScale={2}
                placeholder={String(round2(toPct(sector.growthRate)))}
                value={sub.growthRate === undefined ? '' : round2(toPct(sub.growthRate))}
                onChange={(v) =>
                  onChange({
                    subSectors: sector.subSectors!.map((x) =>
                      x.key === sub.key
                        ? { ...x, growthRate: v === '' ? undefined : fromPct(numOr(v, toPct(sector.growthRate))) }
                        : x,
                    ),
                  })
                }
              />
            ))}
          </SimpleGrid>
        </div>
      ) : null}
    </Stack>
  );
}
