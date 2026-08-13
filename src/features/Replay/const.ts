import type { AggGranularity } from "../../api/types";

export const defaultWindowMs = 12_000;
export const shredsThresholdMs = 60_000;
export const slotsThreshold = 432_000;
export const slotsPerEpoch = 432_000;

export type TsRange = [startTs: number, endTs: number];
export type RgbColor = [r: number, g: number, b: number];

export type RangeChangeHandler = (
  visibleRangeMs: TsRange,
  worldRangeMs: TsRange,
  selectedMs: number | undefined,
) => void;

export interface RangeChangeSubscriberProps {
  subscribeRangeChange: (
    subscriberId: string,
    onRangeChange: RangeChangeHandler,
  ) => void;
  unsubscribeRangeChange: (subscriberId: string) => void;
  getAbsoluteMs: (relativeMs: number) => number;
  getRelativeMs: (absoluteNs: bigint) => number;
}

export interface ExplorableChartProps {
  setUpExploreListeners: (trackEl: HTMLDivElement) => () => void;
}

export interface MarkerLinesProps {
  markerLinesClassName: string;
}

export const msBucketSizes: Record<AggGranularity, number> = {
  "1s": 1_000,
  "30s": 30_000,
  "1m": 60_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

export const ascBucketGranularities = Object.keys(msBucketSizes).sort(
  (a, b) =>
    msBucketSizes[a as AggGranularity] - msBucketSizes[b as AggGranularity],
) as AggGranularity[];
