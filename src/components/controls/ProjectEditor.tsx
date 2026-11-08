import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { he } from '../../i18n/he';
import { computedStatus } from '../../model/projects';
import { ProjectSchema, type Project } from '../../schema';

interface Props {
  /** הפרויקט לעריכה, או null כשהחלון סגור. */
  project: Project | null;
  isNew: boolean;
  asOf: string;
  channels: { value: string; label: string }[];
  onSave: (p: Project) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function ProjectEditor(props: Props) {
  // מפתח לפי id, כדי שהטיוטה תתאפס כשפותחים פרויקט אחר.
  return (
    <Modal
      opened={props.project !== null}
      onClose={props.onClose}
      title={props.isNew ? he.editor.newTitle : he.editor.editTitle}
      size="lg"
    >
      {props.project && <EditorBody key={props.project.id} {...props} project={props.project} />}
    </Modal>
  );
}

function EditorBody({ project, isNew, asOf, channels, onSave, onDelete, onClose }: Props & { project: Project }) {
  const t = he.editor;
  const [draft, setDraft] = useState<Project>(project);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Project>) => setDraft((d) => ({ ...d, ...patch }));
  const num = (v: string | number, fallback: number) => (typeof v === 'number' ? v : fallback);

  const save = () => {
    const clean = { ...draft, notes: draft.notes?.trim() ? draft.notes : undefined };
    const r = ProjectSchema.safeParse(clean);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    onSave(r.data);
  };

  const auto = he.tracking.statuses[computedStatus(draft, asOf)];

  if (confirmDelete) {
    return (
      <Stack>
        <Text size="sm">{t.deleteConfirm(draft.name)}</Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => setConfirmDelete(false)}>
            {t.cancel}
          </Button>
          <Button color="red" onClick={() => onDelete(project.id)}>
            {t.delete}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <TextInput id="pe-name" label={t.name} value={draft.name} error={errors.name} onChange={(e) => set({ name: e.currentTarget.value })} />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <Select
          id="pe-channel"
          label={t.channel}
          data={channels}
          value={draft.channel}
          allowDeselect={false}
          onChange={(v) => v && set({ channel: v })}
        />
        <TextInput id="pe-owner" label={t.owner} value={draft.owner} onChange={(e) => set({ owner: e.currentTarget.value })} />
        <NumberInput
          id="pe-mw"
          label={t.mw}
          min={0}
          step={10}
          value={draft.mw}
          error={errors.mw}
          onChange={(v) => set({ mw: Math.max(0, num(v, draft.mw)) })}
        />
      </SimpleGrid>
      <SimpleGrid cols={2} spacing="sm">
        <TextInput
          id="pe-start"
          type="date"
          label={t.start}
          value={draft.plannedStart}
          error={errors.plannedStart}
          onChange={(e) => set({ plannedStart: e.currentTarget.value })}
        />
        <TextInput
          id="pe-end"
          type="date"
          label={t.end}
          value={draft.plannedEnd}
          error={errors.plannedEnd}
          onChange={(e) => set({ plannedEnd: e.currentTarget.value })}
        />
      </SimpleGrid>
      <div>
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {t.progress}
          </Text>
          <Text size="sm" style={{ direction: 'ltr' }}>
            {draft.progressPct}%
          </Text>
        </Group>
        <Slider
          thumbLabel={t.progress}
          min={0}
          max={100}
          step={1}
          value={draft.progressPct}
          onChange={(progressPct) => set({ progressPct })}
          label={(v) => `${v}%`}
        />
      </div>
      <Select
        id="pe-status"
        label={t.status}
        allowDeselect={false}
        value={draft.status ?? 'auto'}
        onChange={(v) => set({ status: v === 'auto' || !v ? undefined : (v as Project['status']) })}
        data={[
          { value: 'auto', label: t.statusAuto(auto) },
          ...(['on-track', 'at-risk', 'delayed'] as const).map((s) => ({ value: s, label: he.tracking.statuses[s] })),
        ]}
      />
      <Stack gap={6}>
        <Text size="sm" fw={500}>
          {t.milestones}
        </Text>
        {draft.milestones.map((m, i) => (
          <Group key={i} gap="xs" wrap="nowrap" align="center">
            <Checkbox
              aria-label={t.milestoneDone}
              checked={m.done}
              onChange={(e) => {
                const done = e.currentTarget.checked;
                set({ milestones: draft.milestones.map((x, j) => (j === i ? { ...x, done } : x)) });
              }}
            />
            <TextInput
              style={{ flex: 1, minWidth: 0 }}
              aria-label={t.milestoneName}
              size="xs"
              value={m.name}
              onChange={(e) => {
                const name = e.currentTarget.value;
                set({ milestones: draft.milestones.map((x, j) => (j === i ? { ...x, name } : x)) });
              }}
            />
            <TextInput
              w={140}
              type="date"
              size="xs"
              aria-label={t.milestoneDate}
              value={m.date}
              error={errors[`milestones.${i}.date`] ? true : undefined}
              onChange={(e) => {
                const date = e.currentTarget.value;
                set({ milestones: draft.milestones.map((x, j) => (j === i ? { ...x, date } : x)) });
              }}
            />
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={t.remove}
              onClick={() => set({ milestones: draft.milestones.filter((_, j) => j !== i) })}
            >
              ✕
            </ActionIcon>
          </Group>
        ))}
        <Button
          size="compact-xs"
          variant="light"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => set({ milestones: [...draft.milestones, { name: '', date: asOf, done: false }] })}
        >
          + {t.addMilestone}
        </Button>
      </Stack>
      <Textarea id="pe-notes" label={t.notes} autosize minRows={2} value={draft.notes ?? ''} onChange={(e) => set({ notes: e.currentTarget.value })} />
      {Object.keys(errors).length > 0 && (
        <Text size="sm" c="red">
          {t.invalid}: {Object.values(errors)[0]}
        </Text>
      )}
      <Group justify="space-between" mt="xs">
        {!isNew ? (
          <Button variant="subtle" color="red" onClick={() => setConfirmDelete(true)}>
            {t.delete}
          </Button>
        ) : (
          <span />
        )}
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={save}>{t.save}</Button>
        </Group>
      </Group>
    </Stack>
  );
}
