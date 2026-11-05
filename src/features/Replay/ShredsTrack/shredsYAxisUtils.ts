import { MAX_HEIGHT_RATIO } from "./const.ts";

export interface ShredsAxisTick {
  /** fraction of the plot height (0 = top, 1 = bottom). */
  topRatio: number;
  label?: string;
  suffix?: string;
}

const AXIS_TICK_COUNT = 5;

/**
 * Y-axis markers for both agg and non-agg modes.
 * data max is `maxShreds * MAX_HEIGHT_RATIO`.
 */
export function buildShredsTicks(maxShreds: number): ShredsAxisTick[] {
  if (maxShreds <= 0) return [];

  const dataMax = maxShreds * MAX_HEIGHT_RATIO;

  return Array.from({ length: AXIS_TICK_COUNT }, (_, i) => {
    // shreds bars grow downward
    const topRatio = i / (AXIS_TICK_COUNT - 1);
    const valueRatio = topRatio / MAX_HEIGHT_RATIO;
    if (valueRatio > 1) {
      // grid line only
      return { topRatio };
    }

    return {
      topRatio,
      label: Math.round(valueRatio * dataMax).toLocaleString(),
      suffix: `${Math.round(valueRatio * 100)}%`,
    };
  });
}
