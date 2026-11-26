import { Code, Text } from '@mantine/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, type RunStatus } from '../../api/client';
import { he } from '../../i18n/he';
import { Disclosure } from '../controls/Disclosure';

/** כל כמה זמן נקרא הפלט של הרצה פעילה (מילישניות). */
const LOG_POLL_MS = 1000;
/** מרחק מהתחתית (פיקסלים) שבו הפלט עוד "נצמד" לסוף וגולל עם השורות החדשות. */
const STICK_PX = 24;

/** הפלט לתצוגה: מכל שורה רק מה שאחרי ה-\r האחרון (פס התקדמות שנכתב מחדש באותה שורה). */
export function displayLog(raw: string): string {
  return raw
    .split('\n')
    .map((line) => {
      const parts = line.split('\r').filter((p) => p !== '');
      return parts.length ? parts[parts.length - 1] : '';
    })
    .join('\n');
}

/**
 * פלט הפותר של הרצה, בזמן אמת: בזמן שההרצה פעילה נקרא כל שנייה רק מה שנוסף (offset), ואחרי שהסתיימה פעם
 * אחת עד הסוף. מתקפל בידית עם משולש; פתוח כשההרצה פעילה. גולל לסוף כל עוד המשתמש לא גלל למעלה.
 */
export function RunLog({ runId, status }: { runId: string; status: RunStatus }) {
  const active = status === 'queued' || status === 'running';
  const [opened, setOpened] = useState(active);
  const [log, setLog] = useState({ id: runId, text: '' });
  const offset = useRef(0);
  const box = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  // הרצה אחרת: מתחילים מהתחלה, ופותחים אם היא פעילה
  useEffect(() => {
    offset.current = 0;
    stick.current = true;
    setLog({ id: runId, text: '' });
    setOpened(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- רק כשההרצה מתחלפת
  }, [runId]);
  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        // קוראים עד שאין עוד (לוג ארוך מגיע בכמה חלקים)
        for (;;) {
          const r = await api.getLog(runId, offset.current);
          if (!live) return;
          if (r.text) setLog((prev) => (prev.id === runId ? { id: runId, text: prev.text + r.text } : prev));
          const more = r.offset > offset.current && r.text.length > 0;
          offset.current = r.offset;
          if (!more || r.text.length < 200_000) break;
        }
      } catch {
        /* ננסה שוב בפעם הבאה */
      }
      if (live && active) timer = setTimeout(read, LOG_POLL_MS);
    };
    read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [runId, active]);

  const text = useMemo(() => (log.id === runId ? displayLog(log.text) : ''), [log, runId]);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text, opened]);

  return (
    <Disclosure label={he.optimize.log} opened={opened} onToggle={() => setOpened((o) => !o)}>
      {text ? (
        <Code
          block
          ref={box}
          fz="xs"
          mt={4}
          style={{ direction: 'ltr', maxHeight: 300, overflow: 'auto', whiteSpace: 'pre' }}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
          }}
        >
          {text}
        </Code>
      ) : (
        <Text size="xs" c="dimmed" mt={4}>
          {he.optimize.logEmpty}
        </Text>
      )}
    </Disclosure>
  );
}
