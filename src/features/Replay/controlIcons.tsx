// solid icons in the text color, for the Replay controls and visible range popover

interface IconProps {
  className?: string;
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="8"
      height="9"
      viewBox="0 0 8 9"
      fill="currentColor"
      aria-hidden
    >
      <path d="M0 0L8 4.5L0 9Z" />
    </svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="8"
      height="9"
      viewBox="0 0 8 9"
      fill="currentColor"
      aria-hidden
    >
      <rect width="3" height="9" rx="1" />
      <rect x="5" width="3" height="9" rx="1" />
    </svg>
  );
}

export function FullScreenEnterIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="9"
      height="9"
      viewBox="0 0 9 9"
      fill="currentColor"
      aria-hidden
    >
      <path d="M0 0H3.5V1.5H1.5V3.5H0ZM5.5 0H9V3.5H7.5V1.5H5.5ZM0 5.5H1.5V7.5H3.5V9H0ZM7.5 5.5H9V9H5.5V7.5H7.5Z" />
    </svg>
  );
}

export function FullScreenExitIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="9"
      height="9"
      viewBox="0 0 9 9"
      fill="currentColor"
      aria-hidden
    >
      <path d="M2 0H3.5V3.5H0V2H2ZM5.5 0H7V2H9V3.5H5.5ZM0 5.5H3.5V9H2V7H0ZM5.5 5.5H9V7H7V9H5.5Z" />
    </svg>
  );
}

export function CaretDownIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="6"
      height="3"
      viewBox="0 0 6 3"
      fill="currentColor"
      aria-hidden
    >
      <path d="M0 0H6L3 3Z" />
    </svg>
  );
}
