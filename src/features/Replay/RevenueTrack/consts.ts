import { convertToWebGlColor, type RgbColor } from "../../WebGl/webglUtils.ts";
import { feesColor } from "../../../colors.ts";

/** Visible range wider than this switches from per-txn bars to aggregated buckets. */
export const AGGREGATE_THRESHOLD_MS = 60_000;

export const REVENUE_COLOR: RgbColor = convertToWebGlColor(feesColor);

// Vertical bounds of the view/coordinate space
export const viewMinY = 0;
export const viewMaxY = 1;

/** Height floor so any non-zero txn/bucket stays visible instead of collapsing to 0. */
export const minHeightRatio = 0.05;
/** Fraction of each row left empty at the top to visually separate stacked rows. */
export const rowGapRatio = 0.1;

export const nonAggMinAlpha = 0.3;
export const nonAggMaxAlpha = 0.9;

/** Steepness of the "exp" scale. Larger values concentrate more height on the top values. */
export const revenueExpBase = 4;

export type RevenueScale = "banks" | "linear" | "power" | "exp";

export const DEFAULT_REVENUE_SCALE: RevenueScale = "linear";

export const revenueScaleOptions: { value: RevenueScale; label: string }[] = [
  { value: "banks", label: "Banks" },
  { value: "linear", label: "Linear" },
  { value: "power", label: "Power" },
  { value: "exp", label: "Exp" },
];
