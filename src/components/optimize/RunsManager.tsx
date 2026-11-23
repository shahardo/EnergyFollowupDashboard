import { ActionIcon, Button, Checkbox, Group, Modal, ScrollArea, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Run } from '../../api/client';
import { he } from '../../i18n/he';
import { ConfirmBody } from '../layout/ConfirmBody';
import { TrashIcon } from '../layout/icons';

/** How many runs the manager lists (the server's maximum). */
const LIST_LIMIT = 500;

const isActive = (r: Run) => r.status === 'queued' || r.status === 'running';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** A run's description without its name: date · mode · status. */
  describe: (r: Run) => string;
  /** Called after runs were deleted or renamed, so the page refreshes its list (and the run on display). */
  onChanged: (deleted: string[]) => void;
}

/**
 * The saved-runs manager (the "ניהול הרצות" modal): rename a run (saved on blur or Enter), delete one, or tick
 * several and delete them together. Deleting asks first, in the same modal (no window.confirm in an iframe).
 */
export function RunsManager({ opened, onClose, describe, onChanged }: Props) {
  const t = he.optimize;
  const [runs, setRuns] = useState<Run[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) =>
    notifications.show({ color: 'red', message: e instanceof ApiError ? `${he.server.error} (${e.message})` : he.server.error });

  const load = useCallback(async () => {
    try {
      const list = await api.listRuns(LIST_LIMIT);
      setRuns(list);
      setNames(Object.fromEntries(list.map((r) => [r.id, r.name ?? ''])));
      setSelected((prev) => new Set([...prev].filter((id) => list.some((r) => r.id === id && !isActive(r)))));
    } catch (e) {
      fail(e);
    }
  }, []);

  useEffect(() => {
    if (opened) {
      setConfirming(null);
      load();
    }
  }, [opened, load]);

  const rename = async (r: Run) => {
    const name = (names[r.id] ?? '').trim();
    if (name === (r.name ?? '')) return;
    try {
      const next = await api.renameRun(r.id, name);
      setRuns((list) => list.map((x) => (x.id === r.id ? { ...x, name: next.name } : x)));
      setNames((n) => ({ ...n, [r.id]: next.name ?? '' }));
      onChanged([]);
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (ids: string[]) => {
    setBusy(true);
    const deleted: string[] = [];
    try {
      for (const id of ids) {
        await api.deleteRun(id);
        deleted.push(id);
      }
      notifications.show({ color: 'teal', message: t.deleted(deleted.length) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setConfirming(null);
      setSelected(new Set());
      if (deleted.length) onChanged(deleted);
      load();
    }
  };

  const deletable = runs.filter((r) => !isActive(r));
  const allSelected = deletable.length > 0 && deletable.every((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Modal opened={opened} onClose={onClose} title={t.manageTitle} size="lg">
      {confirming ? (
        <ConfirmBody
          message={t.confirmDelete(confirming.length)}
          confirmLabel={t.confirm}
          cancelLabel={t.back}
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : runs.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t.noRuns}
        </Text>
      ) : (
        <Stack gap="xs">
          <Group justify="space-between">
            <Checkbox
              size="xs"
              label={t.selectAll}
              checked={allSelected}
              indeterminate={!allSelected && selected.size > 0}
              onChange={(e) => setSelected(e.currentTarget.checked ? new Set(deletable.map((r) => r.id)) : new Set())}
            />
            <Button
              size="xs"
              color="red"
              variant="light"
              disabled={selected.size === 0}
              loading={busy}
              onClick={() => setConfirming([...selected])}
            >
              {t.deleteSelected(selected.size)}
            </Button>
          </Group>
          <ScrollArea.Autosize mah="60vh">
            <Stack gap={6}>
              {runs.map((r) => (
                <Group key={r.id} gap="xs" wrap="nowrap" align="center">
                  <Checkbox
                    size="xs"
                    aria-label={describe(r)}
                    disabled={isActive(r)}
                    checked={selected.has(r.id)}
                    onChange={(e) => toggle(r.id, e.currentTarget.checked)}
                  />
                  <TextInput
                    size="xs"
                    style={{ flex: '0 1 220px' }}
                    aria-label={t.runName}
                    placeholder={t.noName}
                    maxLength={80}
                    value={names[r.id] ?? ''}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setNames((n) => ({ ...n, [r.id]: value }));
                    }}
                    onBlur={() => rename(r)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <Text size="xs" c="dimmed" style={{ flex: 1 }} truncate>
                    {describe(r)}
                  </Text>
                  <Tooltip label={isActive(r) ? t.activeRun : t.deleteRun}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t.deleteRun}
                      disabled={isActive(r)}
                      onClick={() => setConfirming([r.id])}
                    >
                      <TrashIcon />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      )}
    </Modal>
  );
}
