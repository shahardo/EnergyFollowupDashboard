import { ActionIcon, Collapse, Slider, Text } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import type { SliderRange } from '../../model/sliderRange';
import { useUiStore } from '../../store/uiStore';
import classes from './CenteredSlider.module.css';
import { ColorSquare } from './inputs';

interface Props {
  /** תוכן לפני השם, למשל תיבת סימון. */
  leading?: ReactNode;
  label: string;
  color: string;
  value: number;
  range: SliderRange;
  onChange: (v: number) => void;
  /** שם נגיש לידית. */
  thumbLabel: string;
  /** הטקסט בבועה מעל הידית בזמן גרירה. */
  formatValue: (v: number) => string;
  /** הערך הראשי בצד, למשל "182 TWh". */
  sideValue: string;
  /** שורה קטנה מתחת לערך, למשל "+12 מהבסיס". */
  sideNote?: string;
  disabled?: boolean;
  /**
   * true (ברירת מחדל): הבסיס באמצע, שנת בסיס בולטת ובלי פס מילוי.
   * false: סליידר רגיל מהמינימום (למשל אחוז הפחתה), עם פס מילוי בצבע.
   */
  centered?: boolean;
  /** אם ניתן: כפתור גלגל שיניים שפותח את children. */
  gear?: { open: boolean; onToggle: () => void; label: string };
  children?: ReactNode;
}

/**
 * שורת סליידר "ציר": הבסיס תמיד באמצע (range מ-centeredRange), שנתות לאורך הציר,
 * והתוצאה (למשל ה-TWh ב-2050) מוצגת בצד. רמת הפירוט (uiStore.detail) נקראת מהחנות: medium מסתיר את
 * הערכים בצד, low משאיר רק את השם (כמו מקרא).
 */
/** מצב גלגל השיניים של רשימת שורות: לכל היותר שורה אחת פתוחה. מחזיר את ה-gear של כל שורה. */
export function useSingleGear() {
  const [open, setOpen] = useState<string | null>(null);
  return (key: string, label: string) => ({
    open: open === key,
    onToggle: () => setOpen(open === key ? null : key),
    label,
  });
}

export function CenteredSlider({
  leading,
  label,
  color,
  value,
  range,
  onChange,
  thumbLabel,
  formatValue,
  sideValue,
  sideNote,
  disabled,
  centered = true,
  gear,
  children,
}: Props) {
  const detail = useUiStore((s) => s.detail);
  const quarter = (range.max - range.min) / 4;
  const marks = [0, 1, 2, 3, 4].map((i) => ({ value: range.min + quarter * i }));
  return (
    <div className={classes.container}>
      <div className={`${classes.row} ${detail === 'medium' ? classes.medium : detail === 'low' ? classes.low : ''}`}>
        <div className={classes.name}>
          {leading}
          <ColorSquare color={color} />
          <Text size="sm" fw={500} truncate="end" title={label} c={disabled ? 'dimmed' : undefined}>
            {label}
          </Text>
        </div>
        {detail !== 'low' && (
          <div className={classes.sliderWrap}>
            <Slider
              min={range.min}
              max={range.max}
              step={range.step}
              value={Math.min(range.max, Math.max(range.min, value))}
              onChange={onChange}
              marks={marks}
              color={color}
              thumbLabel={thumbLabel}
              label={formatValue}
              disabled={disabled}
              styles={centered ? { bar: { display: 'none' } } : undefined}
            />
            {centered && <span className={classes.baseTick} aria-hidden />}
          </div>
        )}
        {detail === 'high' && (
          <div className={classes.value}>
            <Text size="sm" fw={600} c={disabled ? 'dimmed' : undefined}>
              {sideValue}
            </Text>
            {sideNote && (
              <Text size="xs" c="dimmed">
                {sideNote}
              </Text>
            )}
          </div>
        )}
        {detail !== 'low' && (
          <div>
            {gear && (
              <ActionIcon
                variant={gear.open ? 'light' : 'subtle'}
                color="gray"
                size="sm"
                aria-label={gear.label}
                aria-expanded={gear.open}
                onClick={gear.onToggle}
              >
                ⚙
              </ActionIcon>
            )}
          </div>
        )}
        {gear && detail !== 'low' && (
          <Collapse in={gear.open} className={classes.details}>
            {children}
          </Collapse>
        )}
      </div>
    </div>
  );
}
