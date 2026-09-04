import { lamportsPerSol } from "../../../consts.ts";
import {
  replayPrimaryTextColor,
  replaySecondaryTextColor,
} from "../../../colors.ts";
import styles from "../chart.module.css";
import { minHeightRatio, type RevenueScale } from "./consts.ts";
import { invertRevenueRatio } from "./utils.ts";

interface RevenueAxisTick {
  topPct: number;
  bound: string;
  label: string;
  pctOfMax: string;
}

function buildRevenueAxisTicks(
  maxValue: bigint,
  scale: RevenueScale,
): RevenueAxisTick[] {
  if (maxValue <= 0n) return [];

  const maxNum = Number(maxValue);
  const step = (1 - minHeightRatio) / 3;
  const heightRatios = [1, 1 - step, minHeightRatio + step, minHeightRatio];

  // The minHeightRatio floor clamps, so the bottom tick is a "≤" bound
  // Banks scale values are ceil clamped, so the top tick is a "≥" bound
  const clampsTop = scale === "banks";

  return heightRatios.map((heightRatio) => {
    const value = invertRevenueRatio(scale, heightRatio, maxNum);
    const sol = (value / lamportsPerSol).toLocaleString(undefined, {
      maximumSignificantDigits: 2,
    });
    const bound =
      heightRatio === minHeightRatio
        ? "≤"
        : clampsTop && heightRatio === 1
          ? "≥"
          : "";
    const pctOfMax = `${((value / maxNum) * 100).toFixed(0)}%`;
    return {
      topPct: (1 - heightRatio) * 100,
      bound,
      label: `${sol} SOL`,
      pctOfMax,
    };
  });
}

interface RevenueYAxisProps {
  maxValue: bigint;
  scale: RevenueScale;
}

export default function RevenueYAxis({ maxValue, scale }: RevenueYAxisProps) {
  if (maxValue <= 0n) return null;

  const ticks = buildRevenueAxisTicks(maxValue, scale);
  const labelWidthCh = Math.max(...ticks.map((tick) => tick.label.length));

  return (
    <div className={styles.yAxis}>
      {ticks.map((tick, i) => (
        <div
          key={`line-${i}`}
          className={styles.yAxisGridLine}
          style={{ top: `${tick.topPct}%` }}
        />
      ))}
      {ticks.map((tick, i) => (
        <div
          key={i}
          className={styles.yAxisTick}
          style={{ top: `${tick.topPct}%`, color: replayPrimaryTextColor }}
        >
          <span
            className="mono-text"
            style={{
              display: "inline-block",
              width: "1ch",
              marginRight: "0.5ch",
            }}
          >
            {tick.bound}
          </span>
          <span
            className="mono-text"
            style={{
              display: "inline-block",
              width: `${labelWidthCh}ch`,
              textAlign: "left",
            }}
          >
            {tick.label}
          </span>
          <span
            className="mono-text"
            style={{
              display: "inline-block",
              width: "4ch",
              marginLeft: "1ch",
              textAlign: "right",
              color: replaySecondaryTextColor,
            }}
          >
            {tick.pctOfMax}
          </span>
        </div>
      ))}
    </div>
  );
}
