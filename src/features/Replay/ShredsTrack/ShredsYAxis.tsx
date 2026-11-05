import clsx from "clsx";
import styles from "../chart.module.css";
import { buildShredsTicks } from "./shredsYAxisUtils.ts";

interface ShredsYAxisProps {
  maxShreds: number;
}

/**
 * Y axis for the Replay shreds track. Markers sit at fixed percents of the data max
 * (5/30/55/80/105%); the 5% and 105% edge markers are grid lines only.
 */
export default function ShredsYAxis({ maxShreds }: ShredsYAxisProps) {
  const ticks = buildShredsTicks(maxShreds);
  if (ticks.length === 0) return null;

  const labeledTicks = ticks.filter((tick) => tick.label != null);
  const maxLabelWidth = Math.max(
    0,
    ...labeledTicks.map((tick) => tick.label!.length),
  );

  return (
    <div className={styles.yAxis}>
      {ticks.map((tick, i) => (
        <div
          key={i}
          className={styles.yAxisGridLine}
          style={{ top: `${tick.topRatio * 100}%` }}
        />
      ))}
      {labeledTicks.map((tick, i) => (
        <div
          key={i}
          className={clsx("mono-text", styles.yAxisTick)}
          style={{ top: `${tick.topRatio * 100}%` }}
        >
          <span
            className={styles.yAxisTickLabel}
            style={{ width: `${maxLabelWidth}ch` }}
          >
            {tick.label}
          </span>
          {tick.suffix != null && (
            <span className={styles.yAxisTickSuffix}>{tick.suffix}</span>
          )}
        </div>
      ))}
    </div>
  );
}
