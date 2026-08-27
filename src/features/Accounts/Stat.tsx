import styles from "./stat.module.css";
import type { CSSProperties } from "react";
import clsx from "clsx";
import type { ValueWithUnit } from "../../utils";

type Size = "sm" | "lg";

interface StatProps {
  className?: string;
  label?: string;
  value: string;
  size?: Size;
  color?: CSSProperties["color"];
  suffix?: string;
  minWidth?: string;
  align?: "start" | "end";
}

export default function Stat({
  className,
  label,
  value,
  size = "sm",
  color,
  suffix,
  minWidth,
  align,
}: StatProps) {
  return (
    <div
      className={clsx(
        "rt-Flex rt-r-fd-column",
        align && `rt-r-ai-${align}`,
        minWidth !== undefined && "rt-r-min-w",
        className,
      )}
      style={
        minWidth !== undefined
          ? ({ "--min-width": minWidth } as CSSProperties)
          : undefined
      }
    >
      {label && <span className={clsx("rt-Text", styles.label)}>{label}</span>}
      <div
        className={clsx("rt-Flex rt-r-ai-baseline", styles.valuesContainer, {
          [styles.lg]: size === "lg",
        })}
      >
        <span
          className={clsx("rt-Text", styles.value)}
          style={color ? { color } : undefined}
        >
          {value}
        </span>
        {suffix && (
          <span className={clsx("rt-Text", styles.suffix)}>{suffix}</span>
        )}
      </div>
    </div>
  );
}
interface FractionStatProps {
  className?: string;
  label?: string;
  numerator: ValueWithUnit;
  denominator: ValueWithUnit;
  color?: CSSProperties["color"];
  minWidth?: string;
}

export function FractionStat({
  className,
  label,
  numerator,
  denominator,
  color,
  minWidth,
}: FractionStatProps) {
  return (
    <div
      className={clsx(
        "rt-Flex rt-r-fd-column",
        minWidth !== undefined && "rt-r-min-w",
        className,
      )}
      style={
        minWidth !== undefined
          ? ({ "--min-width": minWidth } as CSSProperties)
          : undefined
      }
    >
      {label && <span className={clsx("rt-Text", styles.label)}>{label}</span>}
      <div className={clsx("rt-Flex rt-r-ai-baseline", styles.valuesContainer)}>
        <span
          className={clsx("rt-Text", styles.value)}
          style={color ? { color } : undefined}
        >
          {numerator.value}
        </span>
        {numerator.unit !== denominator.unit && (
          <span className={clsx("rt-Text", styles.suffix)}>
            {numerator.unit}
          </span>
        )}
        <span className={clsx("rt-Text", styles.secondaryValue)}>/</span>
        <span className={clsx("rt-Text", styles.secondaryValue)}>
          {denominator.value}
        </span>
        <span className={clsx("rt-Text", styles.suffix)}>
          {denominator.unit}
        </span>
      </div>
    </div>
  );
}
