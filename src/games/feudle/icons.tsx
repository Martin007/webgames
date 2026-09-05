import type {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const defaults = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const ArrowIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

export const BarChartIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const CheckIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <path d="m5 12 4 4L19 6" />
  </svg>
);

export const ClockIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const CloseIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const CopyIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

export const HelpIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.7 9a2.5 2.5 0 0 1 4.85.85c0 1.65-2.55 2.05-2.55 3.65M12 17.25h.01" />
  </svg>
);

export const SparkIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <path d="m12 2 1.5 5.2L19 9l-5.5 1.8L12 16l-1.5-5.2L5 9l5.5-1.8L12 2Z" />
    <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
  </svg>
);

export const TrophyIcon = (props: IconProps) => (
  <svg {...defaults} {...props}>
    <path d="M8 4h8v4a4 4 0 0 1-8 0V4ZM12 12v5M8 21h8M9 17h6" />
    <path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4" />
  </svg>
);
