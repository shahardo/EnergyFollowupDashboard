import { VisuallyHidden } from '@mantine/core';

/** A dot for the detail selector: dot size = amount of detail. The name is accessible and also shows on hover. */
export function DetailDot({ size, text }: { size: number; text: string }) {
  return (
    <span
      title={text}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 18, width: 18 }}
    >
      <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: 'currentColor' }} />
      <VisuallyHidden>{text}</VisuallyHidden>
    </span>
  );
}
