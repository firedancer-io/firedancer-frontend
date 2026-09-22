import { clamp } from "lodash";
import { epochSliderProgressColor } from "../../colors";
import { type RgbColor, convertToWebGlColor } from "../WebGl/webglUtils";

export enum ColorState {
  Skipped = "Skipped",
  NotSkipped = "NotSkipped",
}

export const colorStates = Object.values(ColorState);

export const colors: Record<ColorState, RgbColor> = {
  [ColorState.Skipped]: [235 / 255, 64 / 255, 52 / 255],
  [ColorState.NotSkipped]: convertToWebGlColor(epochSliderProgressColor),
};

export function getBucketColorRatios(
  startSlot: number | null,
  endSlot: number | null,
  skippedCount: number | null,
  minHeightRatio: number,
  maxY: number,
): Record<ColorState, number> {
  if (startSlot == null || endSlot == null || endSlot < startSlot) {
    return {
      [ColorState.Skipped]: 0,
      [ColorState.NotSkipped]: 0,
    };
  }

  const totalSlots = endSlot - startSlot + 1;
  const skippedRatio = skippedCount
    ? clamp(skippedCount / totalSlots, minHeightRatio, maxY)
    : 0;
  return {
    [ColorState.Skipped]: skippedRatio,
    [ColorState.NotSkipped]: maxY - skippedRatio,
  };
}
