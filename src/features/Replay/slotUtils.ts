import {
  epochBarLeaderSlotColor,
  epochBarOtherSkippedSlotColor,
  epochSkippedSlotColor,
  epochSliderProgressColor,
} from "../../colors";
import { type RgbColor, convertToWebGlColor } from "../WebGl/webglUtils";

// Bottom-to-top color order
export enum ColorState {
  MineSkipped = "MineSkipped",
  OtherSkipped = "OtherSkipped",
  MineNotSkipped = "Mine",
  OtherNotSkipped = "NotSkipped",
}

export const colorStates = Object.values(ColorState);

export const colors: Record<ColorState, RgbColor> = {
  [ColorState.MineSkipped]: convertToWebGlColor(epochBarOtherSkippedSlotColor),
  [ColorState.OtherSkipped]: convertToWebGlColor(epochSkippedSlotColor),
  [ColorState.MineNotSkipped]: convertToWebGlColor(epochBarLeaderSlotColor),
  [ColorState.OtherNotSkipped]: convertToWebGlColor(epochSliderProgressColor),
};

export function getBucketColorRatios(
  startSlot: number | null,
  endSlot: number | null,
  skippedCount: number | null,
  mineCount: number | null,
  mineSkippedCount: number | null,
  minHeightRatio: number,
): Record<ColorState, number> | undefined {
  if (startSlot == null || endSlot == null || endSlot < startSlot) {
    return;
  }

  const totalSlots = endSlot - startSlot + 1;
  if (totalSlots <= 0) return;

  const skipped = skippedCount ?? 0;
  const mine = mineCount ?? 0;
  const other = totalSlots - mine;

  const mineSkipped = mineSkippedCount ?? 0;
  const mineNotSkipped = mine - mineSkipped;
  const otherSkipped = skipped - mineSkipped;
  const otherNotSkipped = other - otherSkipped;

  const counts: Record<ColorState, number> = {
    [ColorState.MineSkipped]: mineSkipped,
    [ColorState.OtherSkipped]: otherSkipped,
    [ColorState.MineNotSkipped]: mineNotSkipped,
    [ColorState.OtherNotSkipped]: otherNotSkipped,
  };

  const numNonZeroBands = Object.values(counts).filter(
    (count) => count > 0,
  ).length;

  /**
   * Each non-zero band has at least minHeightRatio (1px). Simplify distribution: give
   * each minHeightRatio, then distribute the remaining height according to the raw ratios
   */
  const remainingRatio = 1 - numNonZeroBands * minHeightRatio;
  const ratios = colorStates.reduce(
    (acc, colorState) => {
      const count = counts[colorState];
      if (count === 0) {
        acc[colorState] = 0;
      } else {
        const rawRatio = count / totalSlots;
        acc[colorState] = minHeightRatio + rawRatio * remainingRatio;
      }
      return acc;
    },
    {} as Record<ColorState, number>,
  );

  return ratios;
}
