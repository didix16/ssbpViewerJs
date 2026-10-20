import type { CSSProperties } from 'react';
export type IconName =
  | 'folder'
  | 'export'
  | 'search'
  | 'chevron'
  | 'eye'
  | 'eye-off'
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'fit'
  | 'flip'
  | 'grid'
  | 'cross'
  | 'close'
  | 'image'
  | 'info'
  | 'file'
  | 'keyboard'
  | 'download'
  | 'reset'
  | 'layers';
const paths: Record<IconName, React.ReactNode> = {
  folder: <path d="M3 7h6l2-2h10v14H3zM3 9h18" />,
  export: (
    <>
      <path d="M12 15V3m-4 4 4-4 4 4M4 12v8h16v-8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  eye: (
    <>
      <path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  'eye-off': (
    <>
      <path d="m3 3 18 18M9 6.4A12 12 0 0 1 12 6c7 0 10 6 10 6a18 18 0 0 1-4 4M6 7.6A18 18 0 0 0 2 12s3 6 10 6a13 13 0 0 0 4-.6" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" fill="currentColor" strokeWidth="0" />,
  pause: <path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" strokeWidth="0" />,
  previous: (
    <>
      <path d="M5 5v14m13-14L8 12l10 7z" fill="currentColor" />
    </>
  ),
  next: (
    <>
      <path d="M19 5v14M6 5l10 7-10 7z" fill="currentColor" />
    </>
  ),
  fit: (
    <>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 9h6v6H9z" />
    </>
  ),
  flip: (
    <>
      <path d="M12 3v18M3 6v12l6-6Zm18 0v12l-6-6Z" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18m6-18v18M3 9h18M3 15h18" />
    </>
  ),
  cross: (
    <>
      <path d="M12 2v20M2 12h20" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 6-6 4 4 3-3 5 5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  file: (
    <>
      <path d="M5 3h9l5 5v13H5zm9 0v6h5M8 13h8m-8 4h6" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />
    </>
  ),
  reset: (
    <>
      <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
};
export function Icon({
  name,
  size = 18,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
