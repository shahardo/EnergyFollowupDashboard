import { toGW, toMt, toPct, toTWh } from '../model/units';
import {
  Alert,
  Button,
  Center,
  Group,
  Input,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type Run, type RunMode, type RunResult } from '../api/client';
import { ChartCard } from '../components/charts/ChartCard';
import { RunLog } from '../components/optimize/RunLog';
import { RunParametersPanel } from '../components/optimize/RunParametersPanel';
import { RunsManager } from '../components/optimize/RunsManager';
import { EnergyUnitSelect } from '../components/charts/EnergyUnitSelect';
import { energyFactor, energyUnitInfo } from '../components/plan/unitSeries';
import type { ChartHandle } from '../components/charts/echartsCore';
import { carrierColors, colorFor, sourceColors } from '../components/charts/palette';
import { StackedAreaChart } from '../components/charts/StackedAreaChart';
import { KpiCard } from '../components/layout/KpiCard';
import { he } from '../i18n/he';
import { toCsv } from '../io/csvExport';
import { measureNonElectric } from '../model/carriers';
import { factorsOf, fuelCo2, sourceCo2 } from '../model/fuel';
import { computeSupply } from '../model/supply';
import { useApiStore } from '../store/apiStore';
import { useDemandStore } from '../store/demandStore';
import { useNonElectric, usePlanSupply } from '../store/usePlanSeries';
import { useSeries } from '../store/useSeries';
import { useSupplyStore } from '../store/supplyStore';
import { useUiStore } from '../store/uiStore';
import { fmt, fmtPct } from '../utils/format';

/** כל כמה זמן בודקים הרצה שעוד לא הסתיימה (מילישניות). */
const POLL_MS = 3000;
/** The emissions key of the fuels burnt in final use (solve.py FINAL_USE_KEY). */
const FINAL_USE = '_finalUse';
/** Its colour in the emissions chart (brown: no source uses it). */
const FINAL_USE_COLOR = '#8d5524';
const active = (r: Run | null) => r?.status === 'queued' || r?.status === 'running';

/**
 * טאב האופטימיזציה: שולח את הביקוש וההיצע הפעילים להרצת OSeMOSYS בשרת, עוקב אחרי ההרצה, ומציג את התוצאה
 * (הספק וייצור לפי מקור, עלות, פליטות) מול התרחיש הפעיל. מוצג רק כשהשרת זמין.
 */
export function OptimizePage() {
  const demand = useDemandStore((s) => s.scenario);
  const supply = useSupplyStore((s) => s.scenario);
  const targetYear = useUiStore((s) => s.targetYear);
  const energyUnit = useUiStore((s) => s.energyUnit);
  const health = useApiStore((s) => s.health);
  const token = useApiStore((s) => s.token);
  const setToken = useApiStore((s) => s.setToken);
  const [mode, setMode] = useState<RunMode>('follow');
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [managing, setManaging] = useState(false);
  const capRef = useRef<ChartHandle>(null);
  const prodRef = useRef<ChartHandle>(null);
  const endUseRef = useRef<ChartHandle>(null);
  const emissionsRef = useRef<ChartHandle>(null);
  const plan = usePlanSupply();
  const { totals, years: demandYears } = useSeries();
  const nonElectric = useNonElectric();
  const t = he.optimize;

  const fail = (e: unknown) =>
    notifications.show({ color: 'red', message: e instanceof ApiError ? `${he.server.error} (${e.message})` : he.server.error });

  const refreshRuns = useCallback(() => api.listRuns().then(setRuns).catch(() => undefined), []);

  const show = useCallback(async (r: Run) => {
    setRun(r);
    setResult(r.status === 'done' ? await api.getResult(r.id).catch(() => null) : null);
  }, []);

  // בטעינה: ההרצות הקודמות, והאחרונה שבהן מוצגת.
  useEffect(() => {
    api
      .listRuns()
      .then((list) => {
        setRuns(list);
        if (list[0]) return api.getRun(list[0].id).then(show);
      })
      .catch(() => undefined);
  }, [show]);

  // מעקב אחרי הרצה שעוד לא הסתיימה.
  useEffect(() => {
    if (!run || !active(run)) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.getRun(run.id);
        if (!active(next)) {
          await show(next);
          refreshRuns();
        } else setRun(next);
      } catch {
        /* ננסה שוב בפעם הבאה */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [run, show, refreshRuns]);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    // שרת שמחכה עד סוף ההרצה (RUN_IN_REQUEST, Cloud Run) עונה רק בסופה: בינתיים מציגים את ההרצה הפעילה מהרשימה,
    // כך שהמצב, הלוג והביטול עובדים גם אז
    const watch = setInterval(async () => {
      const list = await api.listRuns().catch(() => null);
      const current = list?.find(active);
      if (current) setRun((prev) => (prev?.id === current.id && active(prev) ? prev : current));
    }, POLL_MS);
    try {
      const r = await api.submitRun({ demand, supply, runMode: mode });
      if (active(r)) setRun(r);
      else await show(r);
      refreshRuns();
    } catch (e) {
      fail(e);
    } finally {
      clearInterval(watch);
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!run) return;
    try {
      await api.cancelRun(run.id);
      await show(await api.getRun(run.id));
      refreshRuns();
    } catch (e) {
      fail(e);
    }
  };

  // ── הגרפים: שנות הדשבורד בלבד, מקורות לפי סדר התרחיש, ומולם התרחיש הפעיל ──
  const years = useMemo(
    () => (result ? result.years.filter((y) => y >= demand.baseYear && y <= demand.horizonYear) : []),
    [result, demand.baseYear, demand.horizonYear],
  );
  const labels = useMemo(() => new Map(supply.sources.map((s) => [s.key, s.label])), [supply.sources]);
  const order = useMemo(() => supply.sources.map((s) => s.key), [supply.sources]);
  const series = useCallback(
    (rows: { year: number; source: string }[], value: (r: never) => number) => {
      if (!result) return [];
      const by = new Map(rows.map((r) => [`${r.source}|${r.year}`, value(r as never)]));
      return order
        .map((key, i) => ({
          name: labels.get(key) ?? key,
          color: colorFor(sourceColors, key, i),
          values: years.map((y) => by.get(`${key}|${y}`) ?? 0),
        }))
        .filter((s) => s.values.some((v) => v > 0.01));
    },
    [result, order, labels, years],
  );
  const capacity = useMemo(
    () => (result ? series(result.capacity, (r: { power: number }) => toGW(r.power)) : []),
    [result, series],
  );
  const production = useMemo(
    () => (result ? series(result.production, (r: { electricity: number }) => toTWh(r.electricity)) : []),
    [result, series],
  );
  const ef = energyFactor(energyUnit);
  const energyInfo = energyUnitInfo(energyUnit);
  const dashboard = useMemo(() => {
    const pts = computeSupply(supply, years);
    const sum = (k: 'power' | 'energy') => years.map((y) => pts.filter((p) => p.year === y).reduce((a, p) => a + p[k], 0));
    return { gw: sum('power').map(toGW), twh: sum('energy').map(toTWh) };
  }, [supply, years]);
  // תמהיל הנשאים שהמודל בחר (אנרגיה סופית), ומולו האנרגיה הסופית של הדשבורד
  const endUse = useMemo(() => {
    if (!result?.endUse) return [];
    const sum = new Map<string, number>();
    for (const e of result.endUse) sum.set(`${e.carrier}|${e.year}`, (sum.get(`${e.carrier}|${e.year}`) ?? 0) + e.energy);
    return (['electricity', 'fuels', 'gas'] as const)
      .map((c) => ({
        name: he.plan.carriers[c],
        color: carrierColors[c],
        values: years.map((y) => (sum.get(`${c}|${y}`) ?? 0) * ef),
      }))
      .filter((s) => s.values.some((v) => v > 0.01));
  }, [result, years, ef]);
  const dashboardFinal = useMemo(() => {
    const m = measureNonElectric(demand, nonElectric, demandYears);
    return years.map((y) => {
      const i = demandYears.indexOf(y);
      return i < 0 ? 0 : (totals[i].energy + m.fuels[i].netEnergy + m.gas[i].netEnergy) * ef;
    });
  }, [demand, nonElectric, demandYears, totals, years, ef]);
  // Emissions per source (Mt CO₂eq); a run made before emissionsBySource draws its total as one band
  const emissions = useMemo(() => {
    if (!result) return [];
    if (!result.emissionsBySource) {
      const by = new Map(result.emissions.map((e) => [e.year, toMt(e.co2)]));
      return [{ name: t.emissionsTotal, color: '#868e96', values: years.map((y) => by.get(y) ?? 0) }];
    }
    const by = new Map(result.emissionsBySource.map((e) => [`${e.source}|${e.year}`, toMt(e.co2)]));
    return [...order, FINAL_USE]
      .map((key, i) => ({
        name: key === FINAL_USE ? t.emissionsFinalUse : (labels.get(key) ?? key),
        color: key === FINAL_USE ? FINAL_USE_COLOR : colorFor(sourceColors, key, i),
        values: years.map((y) => by.get(`${key}|${y}`) ?? 0),
      }))
      .filter((s) => s.values.some((v) => Math.abs(v) > 0.005));
  }, [result, years, order, labels, t]);
  // The active scenario's emissions, as the scenario-planning tab counts them: electricity (lifecycle) and fuels
  const dashboardCo2 = useMemo(() => {
    const factors = factorsOf(supply.sources);
    const total = new Map<number, number>();
    const add = (year: number, kg: number) => total.set(year, (total.get(year) ?? 0) + kg);
    for (const p of plan.electric) add(p.year, sourceCo2(factors(p.source), p.energy));
    for (const p of plan.fuels) add(p.year, fuelCo2(p.source, p.energy));
    return years.map((y) => toMt(total.get(y) ?? 0));
  }, [plan, supply.sources, years]);

  /** טבלת CSV של הסדרות: שורה לכל שנה, עמודה לכל מקור. */
  const tableCsv = (rows: { name: string; values: number[] }[]) =>
    toCsv([[he.supply.year, ...rows.map((s) => s.name)], ...years.map((y, i) => [y, ...rows.map((s) => s.values[i])])]);

  // ── המדדים ──
  const kpiYears = [...new Set([targetYear, demand.horizonYear])].filter((y) => years.includes(y));
  const renewable = new Set(supply.sources.filter((s) => s.renewable).map((s) => s.key));
  const renewableShare = (y: number) => {
    const rows = result?.production.filter((p) => p.year === y) ?? [];
    const total = rows.reduce((a, p) => a + p.electricity, 0);
    return total > 0 ? toPct(rows.filter((p) => renewable.has(p.source)).reduce((a, p) => a + p.electricity, 0) / total) : 0;
  };

  const statusText = (r: Run) => {
    switch (r.status) {
      case 'queued':
        return t.status.queued(r.queuePosition ?? 0);
      case 'running':
        return t.status.running(r.startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(r.startedAt)) / 1000)) : 0);
      case 'done':
        return t.status.done(r.seconds ?? 0);
      case 'failed':
        return t.status.failed(r.error ?? '');
      case 'cancelled':
        return t.status.cancelled;
    }
  };
  const statusColor = { queued: 'gray', running: 'blue', done: 'teal', failed: 'red', cancelled: 'gray' } as const;
  const describeRun = (r: Run) =>
    `${new Date(r.createdAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })} · ${
      t.modes[r.runMode ?? 'free']?.label ?? ''
    } · ${t.statusWord[r.status]}`;
  const runLabel = (r: Run) => (r.name ? `${r.name} · ${describeRun(r)}` : describeRun(r));

  // After the manager deleted or renamed runs: refresh the list; if the run on display was deleted, show the newest
  const runsChanged = async (deleted: string[]) => {
    const list = await api.listRuns().catch(() => null);
    if (!list) return;
    setRuns(list);
    if (run && deleted.includes(run.id)) {
      if (list[0]) await api.getRun(list[0].id).then(show).catch(() => undefined);
      else {
        setRun(null);
        setResult(null);
      }
    } else if (run) {
      const fresh = list.find((r) => r.id === run.id);
      if (fresh && fresh.name !== run.name) setRun({ ...run, name: fresh.name });
    }
  };

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Title order={2} fz="lg" mb={4}>
          {t.title}
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          {t.intro}
        </Text>
        <Group align="flex-end" gap="md" wrap="wrap">
          <Input.Wrapper label={t.runMode} description={t.modes[mode].desc} size="xs" maw={420}>
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => setMode(v as RunMode)}
              data={(['free', 'capped', 'follow'] as const).map((m) => ({ value: m, label: t.modes[m].label }))}
            />
          </Input.Wrapper>
          {health?.tokenRequired && (
            <PasswordInput
              size="xs"
              w={180}
              label={he.server.token}
              description={he.server.tokenHint}
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
            />
          )}
          <Group gap="xs">
            <Button onClick={submit} loading={busy} disabled={active(run)}>
              {t.run}
            </Button>
            {active(run) && (
              <Button variant="outline" color="red" onClick={cancel}>
                {t.cancel}
              </Button>
            )}
          </Group>
          {runs.length > 0 && (
            <Select
              size="xs"
              w={260}
              label={t.history}
              data={runs.map((r) => ({ value: r.id, label: runLabel(r) }))}
              value={run?.id ?? null}
              onChange={(id) => id && api.getRun(id).then(show).catch(fail)}
              allowDeselect={false}
            />
          )}
          {runs.length > 0 && (
            <Button size="xs" variant="default" onClick={() => setManaging(true)}>
              {t.manage}
            </Button>
          )}
        </Group>
        {run && (
          <Alert mt="sm" color={statusColor[run.status]} variant="light" p="xs">
            <Text size="sm">{statusText(run)}</Text>
            <Stack gap={2} mt={4}>
              <RunLog runId={run.id} status={run.status} />
              <RunParametersPanel runId={run.id} />
            </Stack>
          </Alert>
        )}
      </Paper>

      {result ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <KpiCard
              label={`${t.cost} (${t.costUnit})`}
              values={[{ year: result.years[result.years.length - 1], value: fmt(result.objective / 1e9, 1) }]}
            />
            <KpiCard
              label={t.co2}
              values={kpiYears.map((y) => ({ year: y, value: fmt(toMt(result.emissions.find((e) => e.year === y)?.co2 ?? 0), 1) }))}
            />
            <KpiCard label={t.renewable} values={kpiYears.map((y) => ({ year: y, value: fmtPct(renewableShare(y)) }))} />
          </SimpleGrid>
          {/* RTL: the first cell is the top right one. Total energy, electricity, capacity, emissions. */}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <ChartCard
              title={t.endUseTitle}
              fileStem={`${demand.name}-osemosys-final-energy`}
              csv={() => tableCsv(endUse)}
              toPng={() => endUseRef.current?.toPng() ?? null}
              footer={t.endUseNote}
            >
              {endUse.length > 0 ? (
                <StackedAreaChart
                  ref={endUseRef}
                  years={years}
                  stacked={endUse}
                  compare={[{ name: t.compareEndUse, values: dashboardFinal }]}
                  unit={energyInfo.unit}
                  unitMenu={<EnergyUnitSelect />}
                  digits={energyInfo.digits}
                  targetYear={targetYear}
                  height={360}
                />
              ) : (
                <Center h={360}>
                  <Text size="sm" c="dimmed">
                    {t.noEndUse}
                  </Text>
                </Center>
              )}
            </ChartCard>
            <ChartCard
              title={t.productionTitle}
              fileStem={`${demand.name}-osemosys-production`}
              csv={() => tableCsv(production)}
              toPng={() => prodRef.current?.toPng() ?? null}
              footer={t.sampleNote}
            >
              <StackedAreaChart
                ref={prodRef}
                years={years}
                stacked={production}
                compare={[{ name: t.compareProduction, values: dashboard.twh }]}
                unit="TWh"
                digits={1}
                targetYear={targetYear}
                height={360}
              />
            </ChartCard>
            <ChartCard
              title={t.capacityTitle}
              fileStem={`${demand.name}-osemosys-capacity`}
              csv={() => tableCsv(capacity)}
              toPng={() => capRef.current?.toPng() ?? null}
              footer={t.sampleNote}
            >
              <StackedAreaChart
                ref={capRef}
                years={years}
                stacked={capacity}
                compare={[{ name: t.compareCapacity, values: dashboard.gw }]}
                unit="GW"
                digits={1}
                targetYear={targetYear}
                height={360}
              />
            </ChartCard>
            <ChartCard
              title={t.emissionsTitle}
              fileStem={`${demand.name}-osemosys-emissions`}
              csv={() => tableCsv(emissions)}
              toPng={() => emissionsRef.current?.toPng() ?? null}
              footer={t.emissionsNote}
            >
              <StackedAreaChart
                ref={emissionsRef}
                years={years}
                stacked={emissions}
                compare={[{ name: t.compareEmissions, values: dashboardCo2 }]}
                unit={he.topBar.unitLabel.co2}
                digits={1}
                targetYear={targetYear}
                height={360}
              />
            </ChartCard>
          </SimpleGrid>
        </>
      ) : (
        !active(run) && (
          <Text c="dimmed" size="sm">
            {t.noResult}
          </Text>
        )
      )}
      <RunsManager opened={managing} onClose={() => setManaging(false)} describe={describeRun} onChanged={runsChanged} />
    </Stack>
  );
}
