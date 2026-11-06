// Small inline icons. They're decorative: the buttons that hold them carry names.
import type { SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
export const ChevronDownIcon = () => (
  <Icon width="14" height="14">
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
export const LocateIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Icon>
);
export const PinIcon = () => (
  <Icon>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);
export const FitIcon = () => (
  <Icon>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
);
export const HomeIcon = () => (
  <Icon>
    <path d="M3 11 12 4l9 7" />
    <path d="M5 10v10h14V10" />
  </Icon>
);
export const FilterIcon = () => (
  <Icon>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
);
export const InfoIcon = () => (
  <Icon width="15" height="15">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);
export const ExternalIcon = () => (
  <Icon width="13" height="13">
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

/** The home marker: a house shape the person can drag. */
export function HouseIcon() {
  return (
    <svg viewBox="0 0 32 36" width="32" height="36" aria-hidden="true" focusable="false">
      <path d="M16 35 11 29H6a3 3 0 0 1-3-3V13.5a3 3 0 0 1 1.1-2.3l10-8.2a3 3 0 0 1 3.8 0l10 8.2a3 3 0 0 1 1.1 2.3V26a3 3 0 0 1-3 3h-5Z" fill="#212529" stroke="#fff" strokeWidth="2" />
      <path d="M11 22v-6.5L16 11l5 4.5V22Z" fill="#fff" />
    </svg>
  );
}
