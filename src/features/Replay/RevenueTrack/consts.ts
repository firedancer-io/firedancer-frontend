import { convertToWebGlColor, type RgbColor } from "../../WebGl/webglUtils.ts";
import { feesColor } from "../../../colors.ts";
import { RevenueType } from "../../../api/entities.ts";

/** Visible range wider than this switches from txn bars to aggregated buckets. */
export const AGGREGATE_THRESHOLD_MS = 60_000;

export const REVENUE_COLOR: RgbColor = convertToWebGlColor(feesColor);

/** Vertical bounds of the view/coordinate space */
export const minY = 0;
export const maxY = 1;

export const revenueTrackHeight = 180;
/** Space reserved above the plot so track controls don't cover it. */
export const topInsetPx = 24;
export const cameraMaxY = maxY / (1 - topInsetPx / revenueTrackHeight);

/** Height floor so any non-zero txn/bucket stays visible instead of collapsing to 0. */
export const minHeightRatio = 0.05;
/** Height ceiling for the max value so there is headroom below the top grid line. */
export const maxHeightRatio = 0.95;

export const nonAggMinAlpha = 0.01;
export const nonAggMaxAlpha = 0.9;

export type RevenueScale = "linear" | "power" | "exp";
export const DEFAULT_REVENUE_SCALE: RevenueScale = "linear";
export const revenueScaleOptions: { value: RevenueScale; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "power", label: "Power" },
  { value: "exp", label: "Exponential" },
];

export interface RevenueViewOpts {
  scale: RevenueScale;
  splitByRow: boolean;
}

export const DEFAULT_REVENUE_VIEW_OPTS: RevenueViewOpts = {
  scale: DEFAULT_REVENUE_SCALE,
  splitByRow: false,
};

/** Steepness of the "exp" scale. Larger values concentrate more height on the top values. */
export const revenueExpBase = 4;

export const revenueTypeLabels: Record<RevenueType, string> = {
  [RevenueType.TxnFees]: "Transaction Fees",
  [RevenueType.PrioFees]: "Priority Fees",
  [RevenueType.Tips]: "Tips",
};
