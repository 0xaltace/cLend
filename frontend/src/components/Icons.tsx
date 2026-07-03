/** Minimal stroke icon set — no emoji anywhere in the product chrome. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function I({ size = 16, children, ...rest }: P) {
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
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSun = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </I>
);

export const IconMoon = (p: P) => (
  <I {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </I>
);

export const IconLock = (p: P) => (
  <I {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </I>
);

export const IconUnlock = (p: P) => (
  <I {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V7a4 4 0 0 1 7.7-1.5" />
  </I>
);

export const IconEye = (p: P) => (
  <I {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </I>
);

export const IconEyeOff = (p: P) => (
  <I {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-2.2 3.1M6.6 6.6C4 8.4 2 12 2 12s3.5 7 10 7a9.9 9.9 0 0 0 4.4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </I>
);

export const IconShield = (p: P) => (
  <I {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z" />
  </I>
);

export const IconScale = (p: P) => (
  <I {...p}>
    <path d="M12 3v18M8 21h8" />
    <path d="M5 7l14-2" />
    <path d="M5 7l-2.5 6a3 3 0 0 0 5 0L5 7ZM19 5l-2.5 6a3 3 0 0 0 5 0L19 5Z" />
  </I>
);

export const IconGrid = (p: P) => (
  <I {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </I>
);

export const IconPie = (p: P) => (
  <I {...p}>
    <path d="M21 12A9 9 0 1 1 12 3" />
    <path d="M12 3a9 9 0 0 1 9 9h-9V3Z" />
  </I>
);

export const IconDrop = (p: P) => (
  <I {...p}>
    <path d="M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11Z" />
  </I>
);

export const IconWallet = (p: P) => (
  <I {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
  </I>
);

export const IconArrowRight = (p: P) => (
  <I {...p}>
    <path d="M4 12h16M13 5l7 7-7 7" />
  </I>
);

export const IconExternal = (p: P) => (
  <I {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
  </I>
);

export const IconPlus = (p: P) => (
  <I {...p}>
    <path d="M12 5v14M5 12h14" />
  </I>
);

export const IconMinus = (p: P) => (
  <I {...p}>
    <path d="M5 12h14" />
  </I>
);

export const IconX = (p: P) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
);

export const IconCheck = (p: P) => (
  <I {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </I>
);

export const IconSearch = (p: P) => (
  <I {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.5-4.5" />
  </I>
);

export const IconRefresh = (p: P) => (
  <I {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.3" />
    <path d="M21 3v6h-6" />
  </I>
);

export const IconTarget = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </I>
);

export const IconNest = (p: P) => (
  <I {...p}>
    <path d="M3 12a9 9 0 0 1 18 0c0 3-2 6-9 9-7-3-9-6-9-9Z" />
    <circle cx="12" cy="11" r="3" />
  </I>
);
