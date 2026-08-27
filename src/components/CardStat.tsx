import styles from "./cardStat.module.css";
import { useMemo, type CSSProperties } from "react";
import clsx from "clsx";
import AnimatedInteger from "./AnimatedInteger";

interface CardStatProps {
  label: string;
  value: string | number;
  valueColor?: string;
  valueSize: "small" | "medium" | "large";
  animateInteger?: boolean;
  appendValue?: string;
  appendValueColor?: string;
  className?: string;
}
export default function CardStat({
  label,
  value,
  valueColor,
  valueSize,
  animateInteger = false,
  appendValue,
  appendValueColor,
  className,
}: CardStatProps) {
  const valueClassName = useMemo(() => {
    return clsx(styles.value, {
      [styles.small]: valueSize === "small",
      [styles.medium]: valueSize === "medium",
      [styles.large]: valueSize === "large",
    });
  }, [valueSize]);

  return (
    <div
      className={clsx(
        "rt-Flex rt-r-fd-column rt-r-ai-start",
        styles.container,
        className,
      )}
      style={{ "--value-color": valueColor } as CSSProperties}
    >
      <span className={clsx("rt-Text", styles.label)}>{label}</span>
      <div
        className="rt-Flex rt-r-ai-baseline rt-r-gap-1 rt-r-w"
        style={{ "--width": "100%" } as CSSProperties}
      >
        {typeof value === "number" && animateInteger ? (
          <AnimatedInteger value={value} className={valueClassName} />
        ) : (
          // nbsp reserves the value line before data arrives (CLS)
          <span className={clsx("rt-Text", valueClassName)}>
            {value === "" ? "\u00a0" : value}
          </span>
        )}

        {appendValue && (
          <span
            className={clsx("rt-Text", styles.appendValue)}
            style={
              { "--append-value-color": appendValueColor } as CSSProperties
            }
          >
            {appendValue}
          </span>
        )}
      </div>
    </div>
  );
}
