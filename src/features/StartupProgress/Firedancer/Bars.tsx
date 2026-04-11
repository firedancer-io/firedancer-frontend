import styles from "./bars.module.css";
import { clamp } from "lodash";
import type { CSSProperties } from "react";

const _barWidth = 2;

interface BarsProps {
  value: number;
  max: number;
  barWidth?: number;
}
export function Bars({ value, max, barWidth = _barWidth }: BarsProps) {
  const pct = !max || !value ? 0 : clamp(value / max, 0, 1);

  return (
    <div
      className={styles.bars}
      style={
        {
          "--bar-width": `${barWidth}px`,
          "--bar-gap": `${barWidth * 1.5}px`,
          "--pct": pct,
        } as CSSProperties
      }
    />
  );
}
