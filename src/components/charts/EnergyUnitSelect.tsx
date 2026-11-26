import { Select } from '@mantine/core';
import { useMemo } from 'react';
import { he } from '../../i18n/he';
import { ENERGY_UNITS, useUiStore, type EnergyUnit } from '../../store/uiStore';
import { textWidth } from './echartsCore';

/** The menu's font size and the fixed room for padding and the chevron, to compute its width from the text. */
const FONT_SIZE = 11;
const CHROME = 34;
/** The menu's height: it sits in the chart's top margin, where the axis name would be. */
export const ENERGY_MENU_HEIGHT = 24;

/**
 * The total-energy unit menu (million toe / PJ / TWh) that replaces the Y-axis name of the total-energy charts.
 * Bound to `uiStore.energyUnit`, so one pick changes every such chart on every tab.
 */
export function EnergyUnitSelect() {
  const value = useUiStore((s) => s.energyUnit);
  const setValue = useUiStore((s) => s.setEnergyUnit);
  const labels = he.topBar.energyUnitLabel;
  const width = useMemo(() => Math.max(...ENERGY_UNITS.map((u) => textWidth(labels[u], FONT_SIZE))) + CHROME, [labels]);
  return (
    <Select
      size="xs"
      w={width}
      aria-label={he.topBar.energyUnitMenu}
      title={he.topBar.energyUnitMenu}
      allowDeselect={false}
      value={value}
      onChange={(v) => v && setValue(v as EnergyUnit)}
      data={ENERGY_UNITS.map((u) => ({ value: u, label: labels[u] }))}
      comboboxProps={{ withinPortal: true }}
      styles={{
        input: { height: ENERGY_MENU_HEIGHT, minHeight: ENERGY_MENU_HEIGHT, fontSize: FONT_SIZE, paddingInlineStart: 6 },
        option: { fontSize: FONT_SIZE },
      }}
    />
  );
}
