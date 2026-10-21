import {
  epochSkippedSlotColor,
  epochSliderProgressColor,
  epochSliderTrackColor,
  mySlotsColor,
  replayMiniMapSkippedColor,
} from "../../colors";
import { type RgbColor, convertToWebGlColor } from "../WebGl/webglUtils";

// Bottom-to-top color order
export enum ColorState {
  MineSkipped = "MineSkipped",
  OtherSkipped = "OtherSkipped",
  MineNotSkipped = "Mine",
  OtherNotSkipped = "NotSkipped",
}

export enum BucketColorState {
  OtherNotSkipped = "OtherNotSkipped",
  MyNotSkipped = "MyNotSkipped",
  OtherSkipped = "OtherSkipped",
  MySkipped = "MySkipped",
}

export const bucketColors: Record<BucketColorState, RgbColor> = {
  [BucketColorState.OtherNotSkipped]: convertToWebGlColor(
    epochSliderProgressColor,
  ),
  [BucketColorState.MyNotSkipped]: convertToWebGlColor(mySlotsColor),
  [BucketColorState.OtherSkipped]: convertToWebGlColor(
    replayMiniMapSkippedColor,
  ),
  [BucketColorState.MySkipped]: convertToWebGlColor(epochSkippedSlotColor),
};

export const emptyBucketColor: RgbColor = convertToWebGlColor(
  epochSliderTrackColor,
);

const minSkippedRatio = 0.3;

export function getBucketColor({
  slotCount,
  skippedCount,
  mySlotCount,
  mySkippedSlotCount,
}: {
  slotCount: number;
  skippedCount: number | null;
  mySlotCount: number | null;
  mySkippedSlotCount: number | null;
}) {
  if (!slotCount) {
    return emptyBucketColor;
  }

  const mine = mySlotCount ?? 0;
  const skipped = skippedCount ?? 0;
  const mySkipped = mySkippedSlotCount ?? 0;
  const myNotSkipped = mine - mySkipped;
  const otherSkipped = skipped - mySkipped;
  const otherNotSkipped = slotCount - skipped - myNotSkipped;

  const weights: Record<BucketColorState, number> = {
    [BucketColorState.MySkipped]: mySkipped
      ? Math.max(mySkipped, slotCount * minSkippedRatio)
      : 0,
    [BucketColorState.MyNotSkipped]: myNotSkipped,
    [BucketColorState.OtherSkipped]: otherSkipped
      ? Math.max(otherSkipped, slotCount * minSkippedRatio)
      : 0,
    [BucketColorState.OtherNotSkipped]: otherNotSkipped,
  };

  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (total === 0) return emptyBucketColor;

  const blended: RgbColor = [0, 0, 0];
  for (const state of Object.keys(weights) as BucketColorState[]) {
    const ratio = weights[state] / total;
    if (ratio === 0) continue;
    const color = bucketColors[state];
    blended[0] += color[0] * ratio;
    blended[1] += color[1] * ratio;
    blended[2] += color[2] * ratio;
  }

  return blended;
}
