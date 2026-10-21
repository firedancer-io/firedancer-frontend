import clsx from "clsx";
import { lamportsPerSol } from "../../../consts.ts";
import styles from "../chart.module.css";
import {
  maxHeightRatio,
  minHeightRatio,
  topInsetPx,
  type RevenueScale,
} from "./consts.ts";
import { invertRevenueRatio } from "./scale.ts";

interface RevenueAxisTick {
  topRatio: number;
  prefix: string;
  label: string;
  suffix: string;
}

interface RevenueYAxisProps {
  maxValue: bigint;
  scale: RevenueScale;
  splitRows: boolean;
  numRows: number;
}

const AXIS_TICK_COUNT = 5;
const LABEL_SIG_DIGITS = 3;

export default function RevenueYAxis({
  maxValue,
  scale,
  splitRows,
  numRows,
}: RevenueYAxisProps) {
  if (splitRows) return <RowLabels numRows={numRows} />;
  if (maxValue <= 0n) return null;

  const ticks = buildRevenueAxisTicks(maxValue, scale);
  // top tick is left unlabeled to make room for track controls
  const labeledTicks = ticks.slice(1);
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
          style={{ top: insetTop(tick.topRatio) }}
        />
      ))}
      {labeledTicks.map((tick, i) => (
        <div
          key={i}
          className={clsx("mono-text", styles.yAxisTick)}
          style={{ top: insetTop(tick.topRatio) }}
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

function RowLabels({ numRows }: { numRows: number }) {
  if (numRows <= 0) return null;

  return (
    <div className={styles.yAxis}>
      {Array.from({ length: numRows }, (_, row) => {
        const centerRatio = (row + 0.5) / numRows;
        return (
          <div
            key={row}
            className={styles.yAxisTick}
            style={{ top: insetTop(centerRatio) }}
          >
            <span className={styles.yAxisTickLabel}>{row}</span>
          </div>
        );
      })}
    </div>
  );
}

function insetTop(ratio: number) {
  return `calc(${topInsetPx}px + ${ratio} * (100% - ${topInsetPx}px))`;
}

function buildRevenueAxisTicks(
  maxValue: bigint,
  scale: RevenueScale,
): RevenueAxisTick[] {
  if (maxValue <= 0n) return [];

  const maxNum = Number(maxValue);
  const step = (1 - minHeightRatio) / (AXIS_TICK_COUNT - 1);

  return Array.from({ length: AXIS_TICK_COUNT }, (_, i) => {
    const heightRatio =
      i === AXIS_TICK_COUNT - 1 ? minHeightRatio : 1 - i * step;

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
