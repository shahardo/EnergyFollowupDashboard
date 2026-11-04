import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { he } from '../../i18n/he';

export interface PriorityItem {
  key: string;
  label: string;
  color: string;
  /** האם המקור משתתף בהשלמה האוטומטית. */
  included: boolean;
}

interface Props {
  items: PriorityItem[];
  /** הסדר החדש של כל המקורות. */
  onReorder: (keys: string[]) => void;
  onToggle: (key: string, included: boolean) => void;
}

function Row({ item, index, onToggle }: { item: PriorityItem; index: number; onToggle: Props['onToggle'] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  return (
    <Paper
      ref={setNodeRef}
      withBorder
      px="sm"
      py={6}
      radius="sm"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: item.included ? 1 : 0.6,
        zIndex: isDragging ? 2 : undefined,
        position: 'relative',
        boxShadow: isDragging ? 'var(--mantine-shadow-md)' : undefined,
      }}
    >
      <Group gap={8} wrap="nowrap">
        <Text size="xs" c="dimmed" w={14} ta="center" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {item.included ? index + 1 : '–'}
        </Text>
        <Checkbox
          size="xs"
          checked={item.included}
          onChange={(e) => onToggle(item.key, e.currentTarget.checked)}
          aria-label={he.autofill.include(item.label)}
        />
        <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
        <Text size="sm" style={{ flex: 1 }}>
          {item.label}
        </Text>
        <UnstyledButton
          {...attributes}
          {...listeners}
          aria-label={he.autofill.dragHandle(item.label)}
          style={{ cursor: 'grab', touchAction: 'none', padding: '2px 6px', color: 'var(--mantine-color-dimmed)' }}
        >
          ⠿
        </UnstyledButton>
      </Group>
    </Paper>
  );
}

/** רשימה שאפשר לגרור בה (עכבר, מגע ומקלדת: רווח לתפיסה, חיצים להזזה). */
export function PriorityList({ items, onReorder, onToggle }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = items.map((i) => i.key);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(keys, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))));
  };
  const label = (id: string | number) => items.find((i) => i.key === id)?.label ?? String(id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => label(active.id),
          onDragOver: ({ active, over }) =>
            over ? he.autofill.moved(label(active.id), keys.indexOf(String(over.id)) + 1) : '',
          onDragEnd: ({ active, over }) =>
            over ? he.autofill.moved(label(active.id), keys.indexOf(String(over.id)) + 1) : '',
          onDragCancel: () => '',
        },
      }}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <Stack gap={4}>
          {items.map((item) => (
            <Row
              key={item.key}
              item={item}
              index={items.filter((x) => x.included).indexOf(item)}
              onToggle={onToggle}
            />
          ))}
        </Stack>
      </SortableContext>
    </DndContext>
  );
}
