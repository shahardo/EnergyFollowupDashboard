import { Button, Group, Image, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useRef, useState } from 'react';
import { he } from '../../i18n/he';
import { useExportDialog } from '../../io/exportDialog';

/**
 * חלון הייצוא הידני, כשאי אפשר להוריד קובץ (בתוך iframe): טקסט (JSON, CSV) להעתקה,
 * או תמונה (PNG) לשמירה בקליק ימני. המצב ב-io/exportDialog.ts.
 */
export function ExportDialog() {
  const open = useExportDialog((s) => s.open);
  const fileName = useExportDialog((s) => s.fileName);
  const text = useExportDialog((s) => s.text);
  const imageUrl = useExportDialog((s) => s.imageUrl);
  const close = useExportDialog((s) => s.close);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const t = he.exportDialog;

  const copy = () => {
    if (text === null) return;
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => ref.current?.select());
  };

  return (
    <Modal
      opened={open}
      onClose={() => {
        setCopied(false);
        close();
      }}
      title={t.title}
      size="lg"
    >
      <Stack gap="sm">
        <Text size="sm">{imageUrl ? t.explainImage(fileName) : t.explain(fileName)}</Text>
        {imageUrl && <Image src={imageUrl} alt={fileName} radius="sm" />}
        {text !== null && (
          <>
            <Textarea
              ref={ref}
              id="export-text"
              readOnly
              value={text}
              autosize
              minRows={8}
              maxRows={16}
              styles={{ input: { direction: 'ltr', fontFamily: 'monospace', fontSize: 12 } }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Group justify="flex-end">
              <Button onClick={copy}>{copied ? t.copied : t.copy}</Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
