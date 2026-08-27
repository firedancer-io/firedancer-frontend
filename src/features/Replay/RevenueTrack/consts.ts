import { convertToWebGlColor, type RgbColor } from "../../WebGl/webglUtils.ts";
import { feesColor } from "../../../colors.ts";
import { clampNonZeroValue, logRatio } from "../../../mathUtils.ts";
import { revenueLogBase } from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";

/** Visible range wider than this switches from per-txn bars to aggregated buckets. */
export const AGGREGATE_THRESHOLD_MS = 30_000;

export const REVENUE_COLOR: RgbColor = convertToWebGlColor(feesColor);

export const minY = 0;
export const minNonZeroY = 0.1;
export const aggMaxY = 5;

export const nonAggMaxY = 1;
export const nonAggMinHeightRatio = 0.1;
export const nonAggMaxHeightRatio = 0.9;
export const nonAggMinAlpha = 0.3;
export const nonAggMaxAlpha = 0.9;

/**
 * How many `revenueLogBase` steps below the max span the full height band. A
 * value `logSpan` steps under the max (i.e. maxValue / revenueLogBase^logSpan)
 * maps to the bottom of the band; the max maps to the top, linearly in between.
 */
export const aggLogSpan = 10;
export const nonAggLogSpan = 10;

/**
 * Bar height for a value, laid out LINEARLY in log space: the max sits at the
 * top of the band and each `revenueLogBase` step down drops the height by a
 * fixed fraction (over `logSpan` steps). This replaces the old reciprocal-log
 * mapping, which flattened near the top so every value within ~one step of the
 * max clamped to full height.
 */
export function revenueHeightRatio(
  maxValue: bigint,
  value: bigint,
  low: number,
  high: number,
  logSpan: number,
): number {
  if (maxValue === 0n || value === 0n) return 0;
  const steps = logRatio(Number(maxValue), Number(value), revenueLogBase);
  const ratio = high - (steps / logSpan) * (high - low);
  return clampNonZeroValue(ratio, low, high);
}

export function revenueValueAtHeightRatio(
  maxValue: number,
  heightRatio: number,
  low: number,
  high: number,
  logSpan: number,
): number {
  const steps = ((high - heightRatio) * logSpan) / (high - low);
  return maxValue * Math.pow(revenueLogBase, -steps);
}
