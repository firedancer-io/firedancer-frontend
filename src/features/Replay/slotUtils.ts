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
): Record<ColorState, number> | undefined {
  if (startSlot == null || endSlot == null || endSlot < startSlot) {
    return;
  }

  const totalSlots = endSlot - startSlot + 1;
  const skippedRatio = skippedCount
    ? clamp(skippedCount / totalSlots, minHeightRatio, 1)
    : 0;
  return {
    [ColorState.Skipped]: skippedRatio,
    [ColorState.NotSkipped]: 1 - skippedRatio,
  };
}
