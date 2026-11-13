import { useMemo } from 'react';
import { he } from '../../i18n/he';
import { hasNonElectric, measureNonElectric, projectNonElectric } from '../../model/carriers';
import { TOE_PER_TWH } from '../../model/fuel';
import type { MeasuredTotal } from '../../model/measures';
import { NO_MEASURES } from '../../model/measures';
import { computeDemandSeries } from '../../model/series';
import type { SupplyPoint } from '../../model/supply';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useNonElectric } from '../../store/usePlanSeries';
import { useSeries } from '../../store/useSeries';
import { useUiStore, type PlanView, type Units } from '../../store/uiStore';
import { carrierColors, colorFor, EFFICIENCY_COLOR, SAVING_COLOR, sectorColors } from '../charts/palette';
import { useUnitFactor } from './unitSeries';

/** אילו ביקושים שאינם חשמל נכנסים לגרף: בלי, רק תחבורה (מפוצלת לחשמל ודלקים), או כל המגזרים. */
export type FuelScope = 'none' | 'transport' | 'all';

interface Args {
  /** היחידה של גרף הביקוש: twh, gw או toe. */
  units: Units;
  view: PlanView;
  fuels: FuelScope;
  /** תמהיל ההיצע לחשמל, להמרת ה-TWh של החשמל לשעט"ן. */
  supplyPoints: SupplyPoint[];
}

const TRANSPORT = 'transport';

/**
 * הסדרות של גרף הביקוש (משותף לטאב תרחישי הביקוש והאספקה ולטאב תכנון התרחישים): השכבות הנערמות
 * (מגזרים או מקורות אנרגיה), פס ההפחתות, קו הביקוש נטו וקו ההשוואה. החשמל מומר לפי תמהיל ההיצע;
 * הדלקים והגז הישיר הם אנרגיה סופית (בשעט"ן: × 0.086). במצב GW רק החשמל.
 */
export function useDemandChart({ units, view, fuels, supplyPoints }: Args) {
  const scenario = useDemandStore((s) => s.scenario);
  const reductionBold = useUiStore((s) => s.reductionBold);
  const { years, demandPoints, measured } = useSeries();
  const nePoints = useNonElectric();
  const compareScenario = useCompareStore((s) => s.demand);
  const t = he.plan;
  const gw = units === 'gw';
  const factor = useUnitFactor(units, supplyPoints, years);
  const ff = units === 'toe' ? TOE_PER_TWH : 1;
  const withFuels = fuels !== 'none' && !gw;

  const include = useMemo(() => (key: string) => fuels === 'all' || key === TRANSPORT, [fuels]);
  const ne = useMemo(
    () => (withFuels ? measureNonElectric(scenario, nePoints, years, include) : undefined),
    [withFuels, scenario, nePoints, years, include],
  );

  // ── השכבות ───────────────────────────────────────────────────────────────
  const stacked = useMemo(() => {
    const elecOf = (m: MeasuredTotal) => (gw ? m.grossPeakGW : m.grossTWh * factor(m.year));
    if (view === 'carriers') {
      const c = t.carriers;
      const out = [{ name: c.electricity, color: carrierColors.electricity, values: measured.map(elecOf) }];
      if (ne) {
        out.push({ name: c.fuels, color: carrierColors.fuels, values: ne.fuels.map((m) => m.grossTWh * ff) });
        out.push({ name: c.gas, color: carrierColors.gas, values: ne.gas.map((m) => m.grossTWh * ff) });
      }
      return out;
    }
    const neBy = new Map(nePoints.map((p) => [`${p.sector}|${p.year}`, p.fuelsTWh + p.gasTWh]));
    return scenario.sectors.flatMap((s, i) => {
      const color = colorFor(sectorColors, s.key, i);
      const elec = demandPoints.filter((p) => p.sector === s.key).map((p) => (gw ? p.peakGW : p.twh * factor(p.year)));
      if (!ne || !include(s.key) || !hasNonElectric(s)) return [{ name: s.label, color, values: elec }];
      const fuel = years.map((y) => (neBy.get(`${s.key}|${y}`) ?? 0) * ff);
      if (s.key === TRANSPORT) {
        return [
          { name: t.transportElectric, color, values: elec },
          { name: t.transportFuels, color: sectorColors.transportFuel, values: fuel },
        ];
      }
      return [{ name: s.label, color, values: elec.map((v, k) => v + fuel[k]) }];
    });
  }, [view, scenario.sectors, demandPoints, measured, nePoints, ne, include, years, gw, factor, ff, t]);

  // ── הביקוש נטו, פס ההפחתות וקו ההשוואה ──────────────────────────────────────
  const measures = scenario.measures ?? NO_MEASURES;
  const hasReduction = measures.efficiencyPct > 0 || measures.savingPct > 0;
  const net = useMemo(
    () =>
      measured.map((m, i) =>
        gw ? m.netPeakGW : m.netTWh * factor(m.year) + (ne ? (ne.fuels[i].netTWh + ne.gas[i].netTWh) * ff : 0),
      ),
    [measured, gw, factor, ne, ff],
  );
  const line = useMemo(() => (hasReduction ? { name: t.netDemand, values: net } : undefined), [hasReduction, net, t]);

  const reduction = useMemo(() => {
    if (!hasReduction) return undefined;
    // במצב GW: ההפחתה בשיא באותו יחס כמו באנרגיה; אחרת: לפי מקדם ההמרה של השנה, ועוד ההפחתה בדלקים.
    const share = (m: MeasuredTotal, twh: number) =>
      gw ? (m.grossTWh > 0 ? (m.grossPeakGW * twh) / m.grossTWh : 0) : twh * factor(m.year);
    const neOf = (i: number, k: 'savingTWh' | 'efficiencyTWh') => (ne ? (ne.fuels[i][k] + ne.gas[i][k]) * ff : 0);
    return {
      net,
      layers: [
        { name: t.saving, color: SAVING_COLOR, values: measured.map((m, i) => share(m, m.savingTWh) + neOf(i, 'savingTWh')) },
        {
          name: t.efficiency,
          color: EFFICIENCY_COLOR,
          values: measured.map((m, i) => share(m, m.efficiencyTWh) + neOf(i, 'efficiencyTWh')),
        },
      ],
      faint: !reductionBold,
    };
  }, [hasReduction, net, measured, ne, gw, factor, ff, t, reductionBold]);

  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const cs = computeDemandSeries(compareScenario);
    const cne = withFuels
      ? measureNonElectric(compareScenario, projectNonElectric(compareScenario, cs.demandPoints), cs.years, include)
      : undefined;
    const byYear = new Map(
      cs.measured.map((m, i) => [
        m.year,
        gw ? m.netPeakGW : m.netTWh * factor(m.year) + (cne ? (cne.fuels[i].netTWh + cne.gas[i].netTWh) * ff : 0),
      ]),
    );
    return [{ name: he.compare.line(compareScenario.name), values: years.map((y) => byYear.get(y) ?? null) }];
  }, [compareScenario, withFuels, include, years, gw, factor, ff]);

  return { stacked, reduction, line, compare, withFuels, net };
}
