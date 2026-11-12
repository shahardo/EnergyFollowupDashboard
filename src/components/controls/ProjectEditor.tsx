import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useRef, useState } from 'react';
import { he } from '../../i18n/he';
import { PROJECT_STATUSES, computedStatus } from '../../model/projects';
import { ProjectSchema, type Project } from '../../schema';
import { ConfirmBody } from '../layout/ConfirmBody';

interface Props {
  /** המשימה לעריכה, או null כשהחלון סגור. */
  project: Project | null;
  asOf: string;
  channels: { value: string; label: string }[];
  onSave: (p: Project) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** עורך משימה (חלון): שם, מקור, אחראי, תאריכים, התקדמות, סטטוס, אבני דרך והערות; שמירה או מחיקה. */
export function ProjectEditor(props: Props) {
  return (
    <Modal
      opened={props.project !== null}
      onClose={props.onClose}
      title={he.editor.editTitle}
      size="lg"
    >
      {/* מפתח לפי id, כדי שהטיוטה תתאפס כשפותחים משימה אחרת. */}
      {props.project && <EditorBody key={props.project.id} {...props} project={props.project} />}
    </Modal>
  );
}

/** תוכן העורך: טיוטה מקומית שנבדקת עם Zod רק בשמירה. */
function EditorBody({ project, asOf, channels, onSave, onDelete, onClose }: Props & { project: Project }) {
  const t = he.editor;
  const [draft, setDraft] = useState<Project>(project);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  // מפתחות יציבים לאבני הדרך (אין להן id), כדי שמחיקה מהאמצע לא תעביר פוקוס לשורה אחרת.
  const nextKey = useRef(project.milestones.length);
  const [milestoneKeys, setMilestoneKeys] = useState(() => project.milestones.map((_, i) => i));
  /** מעדכן את הטיוטה ומנקה את השגיאות של השדות שהשתנו. */
  const set = (patch: Partial<Project>) => {
    setDraft((d) => ({ ...d, ...patch }));
    const changed = Object.keys(patch);
    setErrors((e) => {
      const kept = Object.entries(e).filter(([path]) => !changed.includes(path.split('.')[0]));
      return kept.length === Object.keys(e).length ? e : Object.fromEntries(kept);
    });
  };
  const addMilestone = () => {
    setMilestoneKeys((k) => [...k, nextKey.current++]);
    set({ milestones: [...draft.milestones, { name: '', date: asOf, done: false }] });
  };
  const removeMilestone = (i: number) => {
    setMilestoneKeys((k) => k.filter((_, j) => j !== i));
    set({ milestones: draft.milestones.filter((_, j) => j !== i) });
  };

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
      <ConfirmBody
        message={t.deleteConfirm(draft.name)}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => onDelete(project.id)}
      />
    );
  }

  return (
    <Stack gap="sm">
      <TextInput id="pe-name" label={t.name} value={draft.name} error={errors.name} onChange={(e) => set({ name: e.currentTarget.value })} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Select
          id="pe-channel"
          label={t.channel}
          data={channels}
          value={draft.channel}
          allowDeselect={false}
          onChange={(v) => v && set({ channel: v })}
        />
        <TextInput id="pe-owner" label={t.owner} value={draft.owner} onChange={(e) => set({ owner: e.currentTarget.value })} />
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
          ...PROJECT_STATUSES.map((s) => ({ value: s, label: he.tracking.statuses[s] })),
        ]}
      />
      <Stack gap={6}>
        <Text size="sm" fw={500}>
          {t.milestones}
        </Text>
        {draft.milestones.map((m, i) => (
          <Group key={milestoneKeys[i]} gap="xs" wrap="nowrap" align="center">
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
              onClick={() => removeMilestone(i)}
            >
              ✕
            </ActionIcon>
          </Group>
        ))}
        <Button
          size="compact-xs"
          variant="light"
          style={{ alignSelf: 'flex-start' }}
          onClick={addMilestone}
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
        <Button variant="subtle" color="red" onClick={() => setConfirmDelete(true)}>
          {t.delete}
        </Button>
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
