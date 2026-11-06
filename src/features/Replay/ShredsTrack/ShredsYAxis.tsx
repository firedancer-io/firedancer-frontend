import clsx from "clsx";
import styles from "../chart.module.css";
import { isUnderTitle, ROW_LABEL_PX, trackInsetPx } from "../layout.ts";
import { buildShredsTicks } from "./shredsYAxisUtils.ts";

interface ShredsYAxisProps {
  height: number;
  maxShreds: number;
}

/**
 * Y axis for the Replay shreds track
 */
export default function ShredsYAxis({ height, maxShreds }: ShredsYAxisProps) {
  const ticks = buildShredsTicks(maxShreds).map((tick) => ({
    ...tick,
    topPx: trackInsetPx.shreds + tick.topRatio * (height - trackInsetPx.shreds),
  }));
  if (ticks.length === 0) return null;

  let lastLabelTopPx = -Infinity;
  const labeledTicks = ticks.filter(({ label, topPx }) => {
    if (label == null) return false;
    if (isUnderTitle(topPx) || topPx - lastLabelTopPx < ROW_LABEL_PX) {
      return false;
    }
    lastLabelTopPx = topPx;
    return true;
  });
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
          style={{ top: tick.topPx }}
        />
      ))}
      {labeledTicks.map((tick, i) => (
        <div
          key={i}
          className={clsx("mono-text", styles.yAxisTick)}
          style={{ top: tick.topPx }}
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
