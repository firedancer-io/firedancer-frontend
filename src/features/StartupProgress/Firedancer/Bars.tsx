import styles from "./bars.module.css";
import clsx from "clsx";
import { clamp } from "lodash";
import { useMeasure } from "react-use";

const barWidth = 4;
const barGap = barWidth * 1.5;
const viewBoxHeight = 1000;

interface BarsProps {
  value: number;
  max: number;
}
export function Bars({ value, max }: BarsProps) {
  const [ref, { width }] = useMeasure<SVGSVGElement>();

  const barCount = Math.trunc(width / (barWidth + barGap));

  // only show empty bars if no max, or value is actually 0
  const currentIndex =
    !max || !value
      ? -1
      : clamp(Math.round((value / max) * barCount) - 1, 0, barCount - 1);

  const usedWidth = barCount * (barWidth + barGap);

  return (
    <svg
      className={styles.bars}
      ref={ref}
      preserveAspectRatio="none"
      width="100%"
      viewBox={`0 0 ${usedWidth} ${viewBoxHeight}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {Array.from({ length: barCount }, (_, i) => {
        const isHigh = i >= barCount * 0.95;
        const isMid = !isHigh && i >= barCount * 0.85;

        return (
          <rect
            key={i}
            x={i * (usedWidth / barCount)}
            width={barWidth}
            height={viewBoxHeight}
            ry={barWidth * 2}
            className={clsx({
              [styles.threshold]: i === currentIndex,
              [styles.filled]: i < currentIndex,
              [styles.high]: isHigh,
              [styles.mid]: isMid,
            })}
          />
        );
      })}
    </svg>
  );
}
