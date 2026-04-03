import styles from "./bars.module.css";
import { clamp } from "lodash";
import { useMeasure } from "react-use";
import type { CSSProperties } from "react";

const _barWidth = 2;

interface BarsProps {
  value: number;
  max: number;
  barWidth?: number;
}
export function Bars({ value, max, barWidth = _barWidth }: BarsProps) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();

  const barGap = barWidth * 1.5;
  const barStep = barWidth + barGap;
  const barCount = Math.trunc(width / barStep);
  const usedWidth = barCount * barStep;

  const currentIndex =
    !max || !value
      ? -1
      : clamp(Math.round((value / max) * barCount) - 1, 0, barCount - 1);

  const fillPx = currentIndex < 0 ? 0 : currentIndex * barStep;
  const threshPx = currentIndex < 0 ? 0 : currentIndex * barStep;
  const threshEndPx = currentIndex < 0 ? 0 : currentIndex * barStep + barWidth;

  return (
    <div
      ref={ref}
      className={styles.bars}
      style={
        {
          "--bar-w": `${barWidth}px`,
          "--bar-gap": `${barGap}px`,
          "--used-w": `${usedWidth}px`,
          "--fill": `${fillPx}px`,
          "--thresh": `${threshPx}px`,
          "--thresh-end": `${threshEndPx}px`,
          "--thresh-vis": currentIndex >= 0 ? 1 : 0,
        } as CSSProperties
      }
    />
  );
}
