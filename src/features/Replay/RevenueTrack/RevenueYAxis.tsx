import { lamportsPerSol } from "../../../consts.ts";
import styles from "../chart.module.css";
import {
  aggMaxY,
  aggLogSpan,
  minNonZeroY,
  nonAggMaxHeightRatio,
  nonAggMinHeightRatio,
  nonAggLogSpan,
  revenueValueAtHeightRatio,
} from "./consts.ts";

interface RevenueAxisTick {
  topPct: number;
  label: string;
}

function buildRevenueAxisTicks(
  maxValue: bigint,
  lowRatio: number,
  highRatio: number,
  logSpan: number,
  heightToTopPct: (heightRatio: number) => number,
): RevenueAxisTick[] {
  if (maxValue <= 0n) return [];

  const maxNum = Number(maxValue);
  const step = (highRatio - lowRatio) / 3;
  // Four ticks evenly spaced across the height band
  const heightRatios = [highRatio, highRatio - step, lowRatio + step, lowRatio];

  return heightRatios.map((heightRatio) => {
    const value = revenueValueAtHeightRatio(
      maxNum,
      heightRatio,
      lowRatio,
      highRatio,
      logSpan,
    );
    const sol = (value / lamportsPerSol).toLocaleString(undefined, {
      maximumSignificantDigits: 2,
    });
    const bound =
      heightRatio === highRatio ? "≥ " : heightRatio === lowRatio ? "≤ " : "";
    return { topPct: heightToTopPct(heightRatio), label: `${bound}${sol} SOL` };
  });
}

function getAggAxisTicks(maxValue: bigint): RevenueAxisTick[] {
  return buildRevenueAxisTicks(
    maxValue,
    minNonZeroY,
    aggMaxY,
    aggLogSpan,
    (heightRatio) => (1 - heightRatio / aggMaxY) * 100,
  );
}

function getNonAggAxisTicks(maxValue: bigint): RevenueAxisTick[] {
  return buildRevenueAxisTicks(
    maxValue,
    nonAggMinHeightRatio,
    nonAggMaxHeightRatio,
    nonAggLogSpan,
    (heightRatio) => (1 - heightRatio) * 100,
  );
}

interface RevenueYAxisProps {
  maxValue: bigint;
  isAgg: boolean;
}

export default function RevenueYAxis({ maxValue, isAgg }: RevenueYAxisProps) {
  if (maxValue <= 0n) return null;

  const ticks = isAgg
    ? getAggAxisTicks(maxValue)
    : getNonAggAxisTicks(maxValue);

  return (
    <div className={styles.yAxis}>
      {ticks.map((tick, i) => (
        <div
          key={i}
          className={styles.yAxisTick}
          style={{ top: `${tick.topPct}%` }}
        >
          {tick.label}
        </div>
      ))}
    </div>
  );
}
