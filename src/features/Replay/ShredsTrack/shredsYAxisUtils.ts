import { MAX_HEIGHT_RATIO } from "./const.ts";

export interface ShredsAxisTick {
  /** fraction of the plot height (0 = top, 1 = bottom). */
  topRatio: number;
  label?: string;
  suffix?: string;
}

const MARKER_PCTS = [5, 30, 55, 80, 105] as const;
const UNLABELED_PCTS = new Set<number>([5, 105]);

/**
 * Y-axis markers for both agg and non-agg modes.
 * data max is `maxShreds * MAX_HEIGHT_RATIO`.
 */
export function buildShredsTicks(maxShreds: number): ShredsAxisTick[] {
  if (maxShreds <= 0) return [];

  const dataMax = maxShreds * MAX_HEIGHT_RATIO;

  return MARKER_PCTS.map((pct) => {
    // position on the plot: pct of data max, as a fraction of the padded extent
    const topRatio = (pct / 100) * MAX_HEIGHT_RATIO;

    if (UNLABELED_PCTS.has(pct)) {
      return { topRatio };
    }

    return {
      topRatio,
      label: Math.round((pct / 100) * dataMax).toLocaleString(),
      suffix: `${pct}%`,
    };
  });
}
