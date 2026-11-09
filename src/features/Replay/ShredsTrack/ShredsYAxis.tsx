import clsx from "clsx";
import styles from "../chart.module.css";
import { isUnderTitle, ROW_LABEL_PX, trackInsetPx } from "../layout.ts";
import { MAX_HEIGHT_RATIO } from "./const.ts";

interface ShredsAxisTick {
  topRatio: number;
  label?: string;
  suffix?: string;
}

interface ShredsYAxisProps {
  height: number;
  maxShreds: number;
  formatValue?: (value: number) => string;
}

const MIN_AXIS_TICKS = 3;
const MAX_AXIS_TICKS = 5;
const MIN_TICK_GAP_PX = 20;

export default function ShredsYAxis({
  height,
  maxShreds,
  formatValue,
}: ShredsYAxisProps) {
  if (maxShreds <= 0) return null;

  const plotHeightPx = height - trackInsetPx.shreds;
  const ticks = buildShredsAxisTicks(maxShreds, plotHeightPx, formatValue).map(
    (tick) => ({
      ...tick,
      topPx: trackInsetPx.shreds + tick.topRatio * plotHeightPx,
    }),
  );
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

/**
 * Y-axis markers for both agg and non-agg modes. Shred bars grow downward.
 * Grid lines past the data max are drawn without a label.
 */
function buildShredsAxisTicks(
  maxShreds: number,
  plotHeightPx: number,
  formatValue?: (value: number) => string,
): ShredsAxisTick[] {
  if (maxShreds <= 0) return [];

  const tickCount = Math.min(
    MAX_AXIS_TICKS,
    Math.max(MIN_AXIS_TICKS, Math.floor(plotHeightPx / MIN_TICK_GAP_PX) + 1),
  );

  return Array.from({ length: tickCount }, (_, i) => {
    const topRatio = i / (tickCount - 1);
    const valueRatio = topRatio / MAX_HEIGHT_RATIO;
    if (valueRatio > 1) {
      // grid line only
      return { topRatio };
    }

    const value = valueRatio * maxShreds;
    return {
      topRatio,
      label: formatValue?.(value) ?? Math.round(value).toLocaleString(),
      suffix: `${Math.round(valueRatio * 100)}%`,
    };
  });
}
