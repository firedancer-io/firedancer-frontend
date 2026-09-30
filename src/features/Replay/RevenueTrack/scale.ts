import { clampNonZeroValue } from "../../../mathUtils.ts";
import { minHeightRatio, revenueExpBase, type RevenueScale } from "./consts.ts";

// Mirrors revenueRatio() in txnMesh.ts (GLSL)
export function getRevenueRatio(
  scale: RevenueScale,
  maxValue: bigint,
  value: bigint,
) {
  if (maxValue === 0n || value <= 0n) return 0;

  const normalized = Number(value) / Number(maxValue);

  // Height as a ratio of usable height [minHeightRatio, 1]
  let ratio: number;
  switch (scale) {
    case "linear":
      ratio = normalized;
      break;
    case "power":
      ratio = normalized * normalized;
      break;
    case "exp":
      // exp(base·normalized) rescaled from its [1, e^base] range to [0, 1]
      ratio =
        (Math.exp(revenueExpBase * normalized) - 1) /
        (Math.exp(revenueExpBase) - 1);
      break;
  }
  return clampNonZeroValue(ratio, minHeightRatio, 1);
}

export function invertRevenueRatio(
  scale: RevenueScale,
  heightRatio: number,
  maxValue: number,
): number {
  switch (scale) {
    case "linear":
      return maxValue * heightRatio;
    case "power":
      return maxValue * Math.sqrt(heightRatio);
    case "exp":
      return (
        (maxValue *
          Math.log(1 + heightRatio * (Math.exp(revenueExpBase) - 1))) /
        revenueExpBase
      );
  }
}
