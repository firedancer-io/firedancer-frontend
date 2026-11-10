import { clampNonZeroValue } from "../../../mathUtils.ts";
import {
  minHeightRatio,
  revenueLogMinRatio,
  revenuePowerRoot,
  type RevenueScale,
} from "./consts.ts";

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
      ratio = Math.pow(normalized, 1 / revenuePowerRoot);
      break;
    case "log":
      ratio = Math.max(
        1 - Math.log(normalized) / Math.log(revenueLogMinRatio),
        minHeightRatio,
      );
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
      return maxValue * Math.pow(heightRatio, revenuePowerRoot);
    case "log":
      return maxValue * Math.pow(revenueLogMinRatio, 1 - heightRatio);
  }
}
