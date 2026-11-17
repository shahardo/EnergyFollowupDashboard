import { useMemo } from 'react';
import { he } from '../../i18n/he';
import { hasNonElectric, measureNonElectric, projectNonElectric } from '../../model/carriers';
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
import { carrierColors, colorFor, EFFICIENCY_COLOR, SAVING_COLOR, sectorColors } from '../charts/palette';

/** אילו ביקושים שאינם חשמל נכנסים לגרף: בלי, רק תחבורה (מפוצלת לחשמל ודלקים), או כל המגזרים. */
export type FuelScope = 'none' | 'transport' | 'all';

interface Args {
  /** היחידה של גרף הביקוש: twh, gw או toe. */
  units: Units;
  view: PlanView;
  fuels: FuelScope;
}

const TRANSPORT = 'transport';

/**
 * הסדרות של גרף הביקוש (משותף לטאב תרחישי הביקוש והאספקה ולטאב תכנון התרחישים): השכבות הנערמות
 * (מגזרים או מקורות אנרגיה), פס ההפחתות, קו הביקוש נטו וקו ההשוואה. הכול באנרגיה סופית (J → TWh או שעט"ן),
 * בלי תלות בהיצע. במצב GW רק החשמל (שיא, W → GW).
 */
export function useDemandChart({ units, view, fuels }: Args) {
  const scenario = useDemandStore((s) => s.scenario);
  const reductionBold = useUiStore((s) => s.reductionBold);
  const expanded = useUiStore((s) => s.transportExpanded);
  const { years, demandPoints, measured } = useSeries();
  const nePoints = useNonElectric();
  const compareScenario = useCompareStore((s) => s.demand);
  const t = he.plan;
  const gw = units === 'gw';
  // אנרגיה סופית: כל J (חשמל, דלק או גז) מומר ל-TWh או לשעט"ן באותו מקדם, בלי תלות בתמהיל ההיצע, כך ששינוי
  // באספקה לא מזיז את גרף הביקוש.
  const ff = energyDisplayFactor(units);
  const withFuels = fuels !== 'none' && !gw;

  const include = useMemo(() => (key: string) => fuels === 'all' || key === TRANSPORT, [fuels]);
  const ne = useMemo(
    () => (withFuels ? measureNonElectric(scenario, nePoints, years, include) : undefined),
    [withFuels, scenario, nePoints, years, include],
  );

  // ── השכבות ───────────────────────────────────────────────────────────────
  const stacked = useMemo(() => {
    const elecOf = (m: MeasuredTotal) => (gw ? toGW(m.grossPeak) : m.grossEnergy * ff);
    if (view === 'carriers') {
      const c = t.carriers;
      const out = [{ name: c.electricity, color: carrierColors.electricity, values: measured.map(elecOf) }];
      if (ne) {
        out.push({ name: c.fuels, color: carrierColors.fuels, values: ne.fuels.map((m) => m.grossEnergy * ff) });
        out.push({ name: c.gas, color: carrierColors.gas, values: ne.gas.map((m) => m.grossEnergy * ff) });
      }
      return out;
    }
    const neBy = new Map(nePoints.map((p) => [`${p.sector}|${p.year}`, p.fuels + p.gas]));
    const subPoints = expanded ? projectSubSectors(scenario) : [];
    return scenario.sectors.flatMap((s, i) => {
      const color = colorFor(sectorColors, s.key, i);
      const elec = demandPoints.filter((p) => p.sector === s.key).map((p) => (gw ? toGW(p.peak) : p.energy * ff));
      // תתי-המגזרים: שכבת חשמל לכל אחד (במקום שכבת החשמל של המגזר); הדלקים נשארים שכבה אחת.
      const subs = (s.subSectors ?? []).length && expanded
        ? s.subSectors!.map((sub, k) => ({
            name: sub.label,
            color: colorFor(sectorColors, sub.key, k),
            values: subPoints.filter((p) => p.subSector === sub.key).map((p) => (gw ? toGW(p.peak) : p.energy * ff)),
          }))
        : null;
      if (!ne || !include(s.key) || !hasNonElectric(s)) return subs ?? [{ name: s.label, color, values: elec }];
      const fuel = years.map((y) => (neBy.get(`${s.key}|${y}`) ?? 0) * ff);
      if (s.key === TRANSPORT) {
        return [
          ...(subs ?? [{ name: t.transportElectric, color, values: elec }]),
          { name: t.transportFuels, color: sectorColors.transportFuel, values: fuel },
        ];
      }
      if (subs) return [...subs, { name: s.label, color, values: fuel }];
      return [{ name: s.label, color, values: elec.map((v, k) => v + fuel[k]) }];
    });
  }, [view, scenario, demandPoints, measured, nePoints, ne, include, years, gw, ff, t, expanded]);

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
      ? measureNonElectric(compareScenario, projectNonElectric(compareScenario, cs.demandPoints), cs.years, include)
      : undefined;
    const byYear = new Map(
      cs.measured.map((m, i) => [
        m.year,
        gw ? toGW(m.netPeak) : m.netEnergy * ff + (cne ? (cne.fuels[i].netEnergy + cne.gas[i].netEnergy) * ff : 0),
      ]),
    );
    return [{ name: he.compare.line(compareScenario.name), values: years.map((y) => byYear.get(y) ?? null) }];
  }, [compareScenario, withFuels, include, years, gw, ff]);

  return { stacked, reduction, line, compare, withFuels, net };
}
