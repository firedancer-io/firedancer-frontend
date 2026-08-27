import { convertToWebGlColor, type RgbColor } from "../../WebGl/webglUtils.ts";
import { feesColor } from "../../../colors.ts";

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
