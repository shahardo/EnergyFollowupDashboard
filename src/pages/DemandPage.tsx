import { SimpleGrid, Stack, Title } from '@mantine/core';
import { useMemo } from 'react';
import { ChartCard } from '../components/charts/ChartCard';
import { demandCsv } from '../io/csvExport';
import { demandTotals, projectDemand } from '../model/demand';
import { useCompareStore } from '../store/compareStore';
import { colorFor, sectorColors } from '../components/charts/palette';
import { SectorSlider } from '../components/controls/SectorSlider';
import { KpiCard } from '../components/layout/KpiCard';
import { he } from '../i18n/he';
import { useDemandStore } from '../store/demandStore';
import { useSeries } from '../store/useSeries';
import { useUiStore } from '../store/uiStore';
import { fmt, fmtPct } from './format';

export function DemandPage() {
  const scenario = useDemandStore((s) => s.scenario);
  const updateSector = useDemandStore((s) => s.updateSector);
  const { targetYear, units } = useUiStore();
  const { years, demandPoints, totals } = useSeries();
  const compareScenario = useCompareStore((s) => s.demand);
  const t = he.demand;
  const unit = units === 'twh' ? 'TWh' : 'GW';

  const stacked = useMemo(
    () =>
      scenario.sectors.map((s, i) => ({
        name: s.label,
        color: colorFor(sectorColors, s.key, i),
        values: demandPoints.filter((p) => p.sector === s.key).map((p) => (units === 'twh' ? p.twh : p.peakGW)),
      })),
    [scenario.sectors, demandPoints, units],
  );

  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const ct = demandTotals(projectDemand(compareScenario));
    return [
      {
        name: he.compare.demandLine(compareScenario.name),
        values: years.map((y) => {
          const p = ct.find((x) => x.year === y);
          return p ? (units === 'twh' ? p.twh : p.peakGW) : null;
        }) as number[],
      },
    ];
  }, [compareScenario, years, units]);

  const base = totals[0];
  const target = totals.find((x) => x.year === targetYear) ?? totals[totals.length - 1];
  const fastest = useMemo(() => {
    let best = { label: '', ratio: -Infinity };
    for (const s of scenario.sectors) {
      const a = demandPoints.find((p) => p.sector === s.key && p.year === base.year)?.twh ?? 0;
      const b = demandPoints.find((p) => p.sector === s.key && p.year === target.year)?.twh ?? 0;
      const ratio = a > 0 ? b / a : 0;
      if (ratio > best.ratio) best = { label: s.label, ratio };
    }
    return best;
  }, [scenario.sectors, demandPoints, base, target]);

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <KpiCard label={`${t.total} ${target.year}`} value={`${fmt(target.twh, 0)} TWh`} />
        <KpiCard label={`${t.peak} ${target.year}`} value={`${fmt(target.peakGW)} GW`} />
        <KpiCard
          label={t.cumulativeGrowth}
          value={fmtPct((target.twh / base.twh - 1) * 100)}
          hint={t.sinceBase(base.year)}
        />
        <KpiCard label={t.fastest} value={fastest.label} hint={`×${fmt(fastest.ratio)}`} />
      </SimpleGrid>
      <ChartCard
        title={`${t.title} (${unit})`}
        fileStem={`${scenario.name}-demand`}
        csv={() => demandCsv(demandPoints, totals, scenario.sectors)}
        compareName={compareScenario?.name}
        chart={{ years, stacked, compare, unit, targetYear }}
        footer={he.sampleData}
      />
      <Title order={2} fz="md">
        {t.sectors}
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        {scenario.sectors.map((s, i) => (
          <SectorSlider
            key={s.key}
            sector={s}
            color={colorFor(sectorColors, s.key, i)}
            baseYear={scenario.baseYear}
            horizonYear={scenario.horizonYear}
            onChange={(patch) => updateSector(s.key, patch)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
