import type { AggGranularity } from "../../api/types";
import type { TsRange } from "../WebGl/webglUtils";

export const DEFAULT_WINDOW_MS = 12_000;
export const MIN_VISIBLE_MS = 1;

export const msBucketSizes: Record<AggGranularity, number> = {
  "250ms": 250,
  "500ms": 500,
  "1s": 1_000,
  "2s": 2_000,
  "4s": 4_000,
  "8s": 8_000,
  "15s": 15_000,
  "30s": 30_000,
  "1m": 60_000,
  "2m": 120_000,
  "4m": 240_000,
  "8m": 480_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
};

export const ascBucketGranularities = Object.keys(msBucketSizes).sort(
  (a, b) =>
    msBucketSizes[a as AggGranularity] - msBucketSizes[b as AggGranularity],
) as AggGranularity[];

export type RangeChangeHandler = (
  visibleRangeMs: TsRange,
  worldRangeMs: TsRange,
  selectedMs: number | undefined,
) => void;

export interface RangeChangeSubscriberProps {
  subscribeRangeChange: (
    subscriberId: string,
    onVisibleRangeChange: RangeChangeHandler,
    onSelectedMsChange?: RangeChangeHandler,
    onWorldRangeChange?: RangeChangeHandler,
  ) => (() => void) | undefined;
  getAbsoluteNs: (relativeMs: number) => bigint;
  getRelativeMs: (absoluteNs: bigint) => number;
}

export interface ExplorableChartProps {
  setUpExploreListeners: (trackEl: HTMLDivElement) => () => void;
}

export interface MiniMapSetupProps {
  setUpMiniMap: (
    trackEl: HTMLDivElement,
    visibleRangeEl: HTMLDivElement,
    leftHandleEl: HTMLDivElement,
    rightHandleEl: HTMLDivElement,
  ) => () => void;
}

export interface MarkerLinesProps {
  markerLinesClassName: string;
  miniMapMarkerLinesClassName: string;
}
