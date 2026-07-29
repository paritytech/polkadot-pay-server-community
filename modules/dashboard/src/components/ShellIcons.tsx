// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
/* Shell + Quick Start iconography, traced 1:1 from Dashboard.dc.html.
   lucide-react has no geometric match for these, and swapping shapes would
   change the mockup's optical weight, so the source paths live here. */
import type { SVGProps } from 'react';

type IconProps = { className?: string };

const BASE: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

/** Wordmark glyph: a dash feeding a coin. */
export function BrandMarkIcon({ className = 'h-[13px] w-[13px]' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={2.4} className={className}>
      <path d="M4 12h6" />
      <circle cx="15" cy="12" r="4" />
    </svg>
  );
}

export function KeysIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.7} className={className}>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3" />
    </svg>
  );
}

export function WebhookIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.7} className={className}>
      <path d="M6 18a6 6 0 0 1 6-10 6 6 0 0 1 6 6" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="14" r="2" />
    </svg>
  );
}

export function CardIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.7} className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
    </svg>
  );
}

export function BoltIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.7} className={className}>
      <path d="M13 3 5 14h6l-1 7 8-11h-6z" />
    </svg>
  );
}

export function BookIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.7} className={className}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 0 20 15.5z" />
    </svg>
  );
}

export function ExternalArrowIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.8} className={className}>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function SignOutIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.7} className={className}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8 6 12l4 4M6 12h9" />
    </svg>
  );
}

export function ChevronRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={2} className={className}>
      <path d="M10 6l6 6-6 6" />
    </svg>
  );
}
