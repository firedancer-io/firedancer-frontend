import clsx from "clsx";
import { Fragment } from "react";
import { lamportsPerSol } from "../../../consts.ts";
import styles from "../chart.module.css";
import { maxHeightRatio, minHeightRatio, type RevenueScale } from "./consts.ts";
import { invertRevenueRatio } from "./scale.ts";

interface RevenueAxisTick {
  topPct: number;
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

export default function RevenueYAxis({
  maxValue,
  scale,
  splitRows,
  numRows,
}: RevenueYAxisProps) {
  if (splitRows) return <RowLabels numRows={numRows} />;
  if (maxValue <= 0n) return null;

  const ticks = buildRevenueAxisTicks(maxValue, scale);
  const maxLabelWidth = Math.max(...ticks.map((tick) => tick.label.length));

  return (
    <div className={styles.yAxis}>
      {ticks.map((tick, i) => (
        <Fragment key={i}>
          <div
            className={styles.yAxisGridLine}
            style={{ top: `${tick.topPct}%` }}
          />
          <div
            className={clsx("mono-text", styles.yAxisTick)}
            style={{ top: `${tick.topPct}%` }}
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
        </Fragment>
      ))}
    </div>
  );
}

function RowLabels({ numRows }: { numRows: number }) {
  if (numRows <= 0) return null;

  return (
    <div className={styles.yAxis}>
      {Array.from({ length: numRows }, (_, row) => {
        const centerPct = ((row + 0.5) / numRows) * 100;
        return (
          <div
            key={row}
            className={styles.yAxisTick}
            style={{ top: `${centerPct}%` }}
          >
            <span className={styles.yAxisTickLabel}>{`execrp ${row}`}</span>
          </div>
        );
      })}
    </div>
  );
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
      maximumSignificantDigits: 2,
    });
    const valuePct = `${((value / maxNum) * 100).toFixed(0)}%`;

    // Bottom tick is "≤" prefixed because minHeightRatio floor clamps
    const prefix = heightRatio === minHeightRatio ? "≤" : "";

    return {
      topPct: (1 - heightRatio) * 100,
      prefix,
      label: `${valueSol} SOL`,
      suffix: valuePct,
    };
  });
}
