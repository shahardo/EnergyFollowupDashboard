import type { ReactNode } from 'react';

/** אייקונים קטנים בקו (SVG בתוך הקוד, בלי ספריית אייקונים). */
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const SaveIcon = () => (
  <Icon>
    <path d="M6 4h10l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
    <circle cx="12" cy="14" r="2" />
    <path d="M14 4v4H8V4" />
  </Icon>
);

export const FolderIcon = () => (
  <Icon>
    <path d="M5 19l2.757-7.351A1 1 0 0 1 8.693 11H21a1 1 0 0 1 .986 1.164l-.996 5.211A2 2 0 0 1 19.026 19H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v2" />
  </Icon>
);

export const CompareIcon = () => (
  <Icon>
    <path d="M3 18l6-6 4 4 8-8" />
    <path d="M3 12l6-3 4 2 8-4" strokeDasharray="2 3" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icon>
);

export const ResetIcon = () => (
  <Icon>
    <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
  </Icon>
);
