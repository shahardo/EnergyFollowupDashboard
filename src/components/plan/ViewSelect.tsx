import { Select } from '@mantine/core';
import { useMemo } from 'react';
import { textWidth } from '../charts/echartsCore';

interface Props<V extends string> {
  ariaLabel: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (v: V) => void;
}

/** The select's font size (size="xs") and the fixed room for padding and the chevron, to compute an exact width from the text. */
const SELECT_FONT_SIZE = 12;
const SELECT_CHROME = 42;

/**
 * A small select right next to the chart title: "ביקוש לפי:" / "אספקה לפי:" followed by sector vs. energy
 * source, or supply channel vs. final energy. Its width is computed from the longest option, so it isn't too wide.
 */
export function ViewSelect<V extends string>({ ariaLabel, value, options, onChange }: Props<V>) {
  const width = useMemo(
    () => Math.max(...options.map((o) => textWidth(o.label, SELECT_FONT_SIZE))) + SELECT_CHROME,
    [options],
  );
  return (
    <Select
      size="xs"
      w={width}
      aria-label={ariaLabel}
      allowDeselect={false}
      value={value}
      onChange={(v) => v && onChange(v as V)}
      data={options.map(({ value, label }) => ({ value, label }))}
    />
  );
}
