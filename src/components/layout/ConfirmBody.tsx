import { Button, Group, Stack, Text } from '@mantine/core';

interface Props {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * תוכן של חלון אישור: ההודעה, וביטול / אישור אדום. בתוך Modal של Mantine, כי confirm() לא עובד
 * בתוך iframe (Artifact).
 */
export function ConfirmBody({ message, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
  return (
    <Stack gap="md">
      <Text size="sm">{message}</Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button color="red" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
}
