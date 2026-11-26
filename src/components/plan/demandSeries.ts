import { useMemo } from 'react';
import { he } from '../../i18n/he';
import { measureNonElectric, projectNonElectric } from '../../model/carriers';
import { flattenGroups } from '../../model/groups';
import { projectSubSectors } from '../../model/demand';
import type { MeasuredTotal } from '../../model/measures';
import { NO_MEASURES } from '../../model/measures';
import { computeDemandSeries } from '../../model/series';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useNonElectric } from '../../store/usePlanSeries';
import { useSeries } from '../../store/useSeries';
import { useUiStore, type PlanView, type Units } from '../../store/uiStore';
import { toGW } from '../../model/units';
import { energyDisplayFactor } from './unitSeries';
import { EFFICIENCY_COLOR, SAVING_COLOR, shadesOf } from '../charts/palette';
import { demandGroups } from './demandGroups';

/** אילו ביקושים שאינם חשמל נכנסים לגרף: בלי, או כל המגזרים (תחבורה מפוצלת לחשמל ודלקים). */
export type FuelScope = 'none' | 'all';

interface Args {
  /** היחידה של גרף הביקוש: twh, gw או toe. */
  units: Units;
  view: PlanView;
  fuels: FuelScope;
}

/**
 * הסדרות של גרף הביקוש (משותף לטאב תרחישי הביקוש והאספקה ולטאב תכנון התרחישים): השכבות הנערמות
 * (מגזרים או מקורות אנרגיה), פס ההפחתות, קו הביקוש נטו וקו ההשוואה. הכול באנרגיה סופית (J → TWh או שעט"ן),
 * בלי תלות בהיצע. במצב GW רק החשמל (שיא, W → GW).
 */
export function useDemandChart({ units, view, fuels }: Args) {
  const scenario = useDemandStore((s) => s.scenario);
  const reductionBold = useUiStore((s) => s.reductionBold);
  const expanded = useUiStore((s) => s.expanded);
  const energyUnit = useUiStore((s) => s.energyUnit);
  const { years, demandPoints, measured } = useSeries();
  const nePoints = useNonElectric();
  const compareScenario = useCompareStore((s) => s.demand);
  const t = he.plan;
  const gw = units === 'gw';
  // אנרגיה סופית: כל J (חשמל, דלק או גז) מומר ל-TWh או לשעט"ן באותו מקדם, בלי תלות בתמהיל ההיצע, כך ששינוי
  // באספקה לא מזיז את גרף הביקוש.
  const ff = energyDisplayFactor(units, energyUnit);
  const withFuels = fuels !== 'none' && !gw;

  const ne = useMemo(
    () => (withFuels ? measureNonElectric(scenario, nePoints, years) : undefined),
    [withFuels, scenario, nePoints, years],
  );

  // ── The layers: groups (main sectors or carriers), each one band or, expanded, its items in shades ──
  const groups = useMemo(
    () =>
      demandGroups({
        view,
        scenario,
        years,
        demandPoints,
        subPoints: view === 'sectors' ? projectSubSectors(scenario) : [],
        nePoints,
        withFuels: !!ne,
        elecValue: (p) => (gw ? toGW(p.peak) : p.energy * ff),
        factor: ff,
        labels: { ...he.groups, carriers: t.carriers, transportFuels: t.transportFuels },
      }),
    [view, scenario, years, demandPoints, nePoints, ne, gw, ff, t],
  );
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const stacked = useMemo(() => flattenGroups(groups, expandedSet, shadesOf), [groups, expandedSet]);

  // ── הביקוש נטו, פס ההפחתות וקו ההשוואה ──────────────────────────────────────
  const measures = scenario.measures ?? NO_MEASURES;
  const hasReduction = measures.efficiency > 0 || measures.saving > 0;
  const net = useMemo(
    () =>
      measured.map((m, i) =>
        gw ? toGW(m.netPeak) : m.netEnergy * ff + (ne ? (ne.fuels[i].netEnergy + ne.gas[i].netEnergy) * ff : 0),
      ),
    [measured, gw, ne, ff],
  );
  const line = useMemo(() => (hasReduction ? { name: t.netDemand, values: net } : undefined), [hasReduction, net, t]);

  const reduction = useMemo(() => {
    if (!hasReduction) return undefined;
    // במצב GW: ההפחתה בשיא באותו יחס כמו באנרגיה; אחרת: לפי מקדם ההמרה של השנה, ועוד ההפחתה בדלקים.
    const share = (m: MeasuredTotal, energy: number) =>
      gw ? (m.grossEnergy > 0 ? toGW((m.grossPeak * energy) / m.grossEnergy) : 0) : energy * ff;
    const neOf = (i: number, k: 'savingEnergy' | 'efficiencyEnergy') =>
      ne ? (ne.fuels[i][k] + ne.gas[i][k]) * ff : 0;
    return {
      net,
      layers: [
        {
          name: t.saving,
          color: SAVING_COLOR,
          values: measured.map((m, i) => share(m, m.savingEnergy) + neOf(i, 'savingEnergy')),
        },
        {
          name: t.efficiency,
          color: EFFICIENCY_COLOR,
          values: measured.map((m, i) => share(m, m.efficiencyEnergy) + neOf(i, 'efficiencyEnergy')),
        },
      ],
      faint: !reductionBold,
    };
  }, [hasReduction, net, measured, ne, gw, ff, t, reductionBold]);

  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const cs = computeDemandSeries(compareScenario);
    const cne = withFuels
      ? measureNonElectric(compareScenario, projectNonElectric(compareScenario, cs.demandPoints), cs.years)
      : undefined;
    const byYear = new Map(
      cs.measured.map((m, i) => [
        m.year,
        gw ? toGW(m.netPeak) : m.netEnergy * ff + (cne ? (cne.fuels[i].netEnergy + cne.gas[i].netEnergy) * ff : 0),
      ]),
    );
    return [{ name: he.compare.line(compareScenario.name), values: years.map((y) => byYear.get(y) ?? null) }];
  }, [compareScenario, withFuels, years, gw, ff]);

  return { groups, stacked, reduction, line, compare, withFuels, net };
}
