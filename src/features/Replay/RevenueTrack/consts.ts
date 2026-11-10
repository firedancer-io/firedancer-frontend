import { convertToWebGlColor, type RgbColor } from "../../WebGl/webglUtils.ts";
import { feesColor, incomeColor, tipsColor } from "../../../colors.ts";
import { RevenueType } from "../../../api/entities.ts";
import { trackInsetPx } from "../layout.ts";

/** Visible range wider than this switches from txn bars to aggregated buckets. */
export const AGGREGATE_THRESHOLD_MS = 60_000;

/** Vertical bounds of the view/coordinate space */
export const minY = 0;
export const maxY = 1;

export function getCameraMaxY(heightPx: number) {
  const insetPx = trackInsetPx.income;
  return maxY / (1 - insetPx / Math.max(heightPx, insetPx + 1));
}

/** Height floor so any non-zero txn/bucket stays visible instead of collapsing to 0. */
export const minHeightRatio = 0.05;
/** Height ceiling for the max value so there is headroom below the top grid line. */
export const maxHeightRatio = 0.95;

export const nonAggMinAlpha = 0.05;
export const nonAggMaxAlpha = 0.9;

export type RevenueScale = "linear" | "power" | "log";
export const DEFAULT_REVENUE_SCALE: RevenueScale = "linear";
export const revenueScaleOptions: { value: RevenueScale; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "power", label: "Power" },
  { value: "log", label: "Log" },
];

export enum RevenueSeries {
  Fees = "fees",
  Tips = "tips",
  Income = "income",
}

export interface TxnMetaDetails {
  execIdx: number;
  transactionFee: bigint;
  priorityFee: bigint;
  tips: bigint;
  loadStartMs: number;
}

/** Revenue types summed to get each series */
export const revenueSeriesAddends: Record<
  RevenueSeries,
  readonly RevenueType[]
> = {
  [RevenueSeries.Fees]: [RevenueType.TxnFees, RevenueType.PrioFees],
  [RevenueSeries.Tips]: [RevenueType.Tips],
  [RevenueSeries.Income]: [
    RevenueType.TxnFees,
    RevenueType.PrioFees,
    RevenueType.Tips,
  ],
};

export interface RevenueViewOpts {
  type: RevenueSeries;
  scale: RevenueScale;
  splitByRow: boolean;
}

export const DEFAULT_REVENUE_VIEW_OPTS: RevenueViewOpts = {
  type: RevenueSeries.Income,
  scale: DEFAULT_REVENUE_SCALE,
  splitByRow: false,
};

/** n in the "power" scale's x^(1/n). Larger values give more height to small values. */
export const revenuePowerRoot = 4;

/** Smallest value / max ratio spanned by the "log" scale. Smaller values are floored. */
export const revenueLogMinRatio = 1e-6;

export const revenueSeriesLabels: Record<RevenueSeries, string> = {
  [RevenueSeries.Fees]: "Fees",
  [RevenueSeries.Tips]: "Tips",
  [RevenueSeries.Income]: "Income",
};

export const revenueSeriesHexColors: Record<RevenueSeries, string> = {
  [RevenueSeries.Fees]: feesColor,
  [RevenueSeries.Tips]: tipsColor,
  [RevenueSeries.Income]: incomeColor,
};

const revenueSeriesDescriptions: Partial<Record<RevenueSeries, string>> = {
  [RevenueSeries.Fees]: "txn + priority",
  [RevenueSeries.Income]: "fees + tips",
};

export const revenueSeries = Object.values(RevenueSeries).map((series) => ({
  value: series,
  label: revenueSeriesLabels[series],
  color: revenueSeriesHexColors[series],
  description: revenueSeriesDescriptions[series],
}));

export const revenueSeriesColors = Object.fromEntries(
  Object.values(RevenueSeries).map((series) => [
    series,
    convertToWebGlColor(revenueSeriesHexColors[series]),
  ]),
) as Record<RevenueSeries, RgbColor>;
