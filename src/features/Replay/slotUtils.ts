import type { RgbColor } from "../WebGl/webglUtils";

export enum BucketColorState {
  OtherNotSkipped = "OtherNotSkipped",
  MyNotSkipped = "MyNotSkipped",
  OtherSkipped = "OtherSkipped",
  MySkipped = "MySkipped",
}

/**
 * Weighted average of [color, weight] pairs
 */
export function blendColors(
  weighted: [color: RgbColor, weight: number][],
): RgbColor | undefined {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  if (total === 0) return undefined;

  const blended: RgbColor = [0, 0, 0];
  for (const [color, weight] of weighted) {
    const ratio = weight / total;
    if (ratio === 0) continue;
    blended[0] += color[0] * ratio;
    blended[1] += color[1] * ratio;
    blended[2] += color[2] * ratio;
  }
  return blended;
}

export interface ColorInfo {
  color: RgbColor;
  minWeight?: number;
}

function getBucketWeight(
  totalCount: number,
  count: number,
  minWeight?: number,
) {
  if (!count) return 0;
  return minWeight != null ? Math.max(count, totalCount * minWeight) : count;
}

export function getBucketColor({
  totalCount,
  skippedCount,
  mineCount,
  mySkippedCount,
  colors,
  emptyColor,
}: {
  totalCount: number;
  skippedCount: number | null;
  mineCount: number | null;
  mySkippedCount: number | null;
  colors: Record<BucketColorState, ColorInfo>;
  emptyColor: RgbColor;
}) {
  if (!totalCount) {
    return emptyColor;
  }

  const skipped = skippedCount ?? 0;
  const mine = mineCount ?? 0;
  const mySkipped = mySkippedCount ?? 0;
  const myNotSkipped = mine - mySkipped;
  const otherSkipped = skipped - mySkipped;
  const otherNotSkipped = totalCount - skipped - myNotSkipped;

  // Each sub count contributes its color weighted by its (floored) count.
  return (
    blendColors([
      [
        colors[BucketColorState.MyNotSkipped].color,
        getBucketWeight(
          totalCount,
          myNotSkipped,
          colors[BucketColorState.MyNotSkipped].minWeight,
        ),
      ],
      [
        colors[BucketColorState.MySkipped].color,
        getBucketWeight(
          totalCount,
          mySkipped,
          colors[BucketColorState.MySkipped].minWeight,
        ),
      ],
      [
        colors[BucketColorState.OtherSkipped].color,
        getBucketWeight(
          totalCount,
          otherSkipped,
          colors[BucketColorState.OtherSkipped].minWeight,
        ),
      ],
      [
        colors[BucketColorState.OtherNotSkipped].color,
        Math.max(0, otherNotSkipped),
      ],
    ]) ?? emptyColor
  );
}
