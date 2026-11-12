import { ActionIcon, Button, Group, NumberInput, Slider, Stack, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import { clamp } from '../../model/math';
import type { CapacityPoint, SupplySource } from '../../schema';
import { numOr } from './inputs';

interface Props {
  source: SupplySource;
  color: string;
  minYear: number;
  maxYear: number;
  onChange: (patch: Partial<SupplySource>) => void;
}

/** הטווח של סליידר נקודת עוגן (GW). */
const MAX_GW = 60;

const byYear = (points: CapacityPoint[]) => [...points].sort((a, b) => a.year - b.year);

/** השנה הפנויה הראשונה מ-from (ואם אין, אחורה ממנה) בטווח, או null כשכל השנים תפוסות. */
function freeYear(taken: Set<number>, from: number, minYear: number, maxYear: number): number | null {
  for (let y = from; y <= maxYear; y++) if (!taken.has(y)) return y;
  for (let y = from - 1; y >= minYear; y--) if (!taken.has(y)) return y;
  return null;
}

/** הפרמטרים המפורטים של מקור (נפתחים מגלגל השיניים): נקודות עוגן, CF, credit, תקרה ושנת הוצאה. */
export function SourceDetails({ source, color, minYear, maxYear, onChange }: Props) {
  const t = he.supply;
  const anchors = source.capacityGW;
  // בזמן הקלדת שנה הסדר לא משתנה (כדי שהשדה לא יקפוץ לשורה אחרת); ממיינים כשיוצאים מהשדה.
  const setAnchors = (capacityGW: CapacityPoint[]) => onChange({ capacityGW });
  const sortAnchors = () => {
    const sorted = byYear(anchors);
    if (sorted.some((p, i) => p !== anchors[i])) setAnchors(sorted);
  };

  const last = anchors.reduce<CapacityPoint | undefined>((a, p) => (!a || p.year > a.year ? p : a), undefined);
  const nextYear = freeYear(
    new Set(anchors.map((p) => p.year)),
    clamp((last?.year ?? minYear) + 5, minYear, maxYear),
    minYear,
    maxYear,
  );
  const addAnchor = () => {
    if (nextYear !== null) setAnchors(byYear([...anchors, { year: nextYear, gw: last?.gw ?? 0 }]));
  };

  return (
    <Stack gap="xs" py="xs">
      <Text size="xs" fw={500}>
        {t.anchors}
      </Text>
      {anchors.map((a, i) => (
        <Group key={i} gap="xs" wrap="nowrap" align="center">
          <NumberInput
            size="xs"
            w={76}
            aria-label={t.year}
            min={minYear}
            max={maxYear}
            value={a.year}
            onChange={(v) =>
              setAnchors(
                anchors.map((p, j) =>
                  j === i ? { ...p, year: Math.round(clamp(numOr(v, p.year), minYear, maxYear)) } : p,
                ),
              )
            }
            onBlur={sortAnchors}
          />
          <Slider
            style={{ flex: 1 }}
            thumbLabel={`${source.label} ${a.year} GW`}
            min={0}
            max={MAX_GW}
            step={0.1}
            value={a.gw}
            color={color}
            label={(v) => `${v} GW`}
            onChange={(gw) => setAnchors(anchors.map((p, j) => (j === i ? { ...p, gw } : p)))}
          />
          <Text size="xs" w={52} ta="end" style={{ direction: 'ltr' }}>
            {a.gw.toFixed(1)} GW
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={t.removeAnchor}
            disabled={anchors.length <= 1}
            onClick={() => setAnchors(anchors.filter((_, j) => j !== i))}
          >
            ✕
          </ActionIcon>
        </Group>
      ))}
      <Button
        size="compact-xs"
        variant="light"
        onClick={addAnchor}
        disabled={nextYear === null}
        style={{ alignSelf: 'flex-start' }}
      >
        + {t.addAnchor}
      </Button>
      <Group grow gap="xs">
        <NumberInput
          size="xs"
          label={t.capacityFactor}
          min={0}
          max={1}
          step={0.01}
          decimalScale={2}
          value={source.capacityFactor}
          onChange={(v) => onChange({ capacityFactor: clamp(numOr(v, source.capacityFactor), 0, 1) })}
        />
        <NumberInput
          size="xs"
          label={t.capacityCredit}
          min={0}
          max={1}
          step={0.05}
          decimalScale={2}
          value={source.capacityCredit}
          onChange={(v) => onChange({ capacityCredit: clamp(numOr(v, source.capacityCredit), 0, 1) })}
        />
      </Group>
      <NumberInput
        size="xs"
        label={t.maxGW}
        placeholder={t.noCap}
        min={0}
        step={0.5}
        decimalScale={2}
        value={source.maxGW ?? ''}
        onChange={(v) => onChange({ maxGW: typeof v === 'number' ? Math.max(0, v) : undefined })}
      />
      <NumberInput
        size="xs"
        label={t.retireYear}
        min={minYear}
        max={2100}
        allowDecimal={false}
        value={source.retireYear ?? ''}
        onChange={(v) => onChange({ retireYear: typeof v === 'number' ? Math.round(v) : undefined })}
      />
    </Stack>
  );
}
