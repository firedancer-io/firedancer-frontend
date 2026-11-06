import clsx from "clsx";
import { lamportsPerSol } from "../../../consts.ts";
import styles from "../chart.module.css";
import { maxHeightRatio, minHeightRatio, type RevenueScale } from "./consts.ts";
import { invertRevenueRatio } from "./scale.ts";
import RowLabels from "../RowLabels.tsx";
import {
  getRowsLayout,
  isUnderTitle,
  ROW_LABEL_PX,
  trackInsetPx,
} from "../layout.ts";

interface RevenueAxisTick {
  topRatio: number;
  prefix: string;
  label: string;
  suffix: string;
}

interface RevenueYAxisProps {
  height: number;
  maxValue: bigint;
  scale: RevenueScale;
  splitRows: boolean;
  numRows: number;
}

// the top tick's label is always under the title
const MIN_AXIS_TICKS = 3;
const MAX_AXIS_TICKS = 5;
const MIN_TICK_GAP_PX = 20;
const LABEL_SIG_DIGITS = 3;

export default function RevenueYAxis({
  height,
  maxValue,
  scale,
  splitRows,
  numRows,
}: RevenueYAxisProps) {
  if (splitRows) {
    return (
      <RowLabels
        labels={Array.from({ length: numRows }, (_, row) => `${row}`)}
        layout={getRowsLayout(height, numRows, {
          insetPx: trackInsetPx.income,
        })}
      />
    );
  }
  if (maxValue <= 0n) return null;

  const plotHeightPx = height - trackInsetPx.income;
  const ticks = buildRevenueAxisTicks(maxValue, scale, plotHeightPx).map(
    (tick) => ({
      ...tick,
      topPx: trackInsetPx.income + tick.topRatio * plotHeightPx,
    }),
  );
  let lastLabelTopPx = -Infinity;
  const labeledTicks = ticks.filter(({ topPx }) => {
    if (isUnderTitle(topPx) || topPx - lastLabelTopPx < ROW_LABEL_PX) {
      return false;
    }
    lastLabelTopPx = topPx;
    return true;
  });
  const maxLabelWidth = Math.max(
    0,
    ...labeledTicks.map((tick) => tick.label.length),
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
          <span className={styles.yAxisTickPrefix}>{tick.prefix}</span>
          <span
            className={styles.yAxisTickLabel}
            style={{ width: `${maxLabelWidth}ch` }}
          >
            {tick.label}
          </span>
          <span className={styles.yAxisTickSuffix}>{tick.suffix}</span>
        </div>
      ))}
    </div>
  );
}

function buildRevenueAxisTicks(
  maxValue: bigint,
  scale: RevenueScale,
  plotHeightPx: number,
): RevenueAxisTick[] {
  if (maxValue <= 0n) return [];

  const maxNum = Number(maxValue);
  const spanRatio = 1 - minHeightRatio;
  const tickCount = Math.min(
    MAX_AXIS_TICKS,
    Math.max(
      MIN_AXIS_TICKS,
      Math.floor((spanRatio * plotHeightPx) / MIN_TICK_GAP_PX) + 1,
    ),
  );
  const step = spanRatio / (tickCount - 1);

  return Array.from({ length: tickCount }, (_, i) => {
    const heightRatio = i === tickCount - 1 ? minHeightRatio : 1 - i * step;

    const value = invertRevenueRatio(
      scale,
      heightRatio / maxHeightRatio,
      maxNum,
    );
    const valueSol = (value / lamportsPerSol).toLocaleString(undefined, {
      maximumSignificantDigits: LABEL_SIG_DIGITS,
    });
    const valuePct = `${((value / maxNum) * 100).toFixed(0)}%`;

    // Bottom tick is "≤" prefixed because minHeightRatio floor clamps
    const prefix = heightRatio === minHeightRatio ? "≤" : "";

    return {
      topRatio: 1 - heightRatio,
      prefix,
      label: `${valueSol} SOL`,
      suffix: valuePct,
    };
  });
}
