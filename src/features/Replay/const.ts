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
  getRelativeMs: (absoluteMs: number) => number;
}

export interface ExplorableChartProps {
  setUpExploreListeners: (trackEl: HTMLDivElement) => () => void;
}

export interface MarkerLinesProps {
  markerLinesClassName: string;
}
