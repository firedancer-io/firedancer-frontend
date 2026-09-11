import type { HistoryEntry } from "../../../api/worker/types";
import type { EstimatedTps } from "../../../api/types";
import { tpsRenderWindowMs } from "../../../api/worker/cache/consts";

export interface TpsDataPoint {
  ts: number;
  tps: EstimatedTps;
}

export interface TpsSnapshot {
  points: TpsDataPoint[];
  maxTotalY: number;
}

export interface TpsBuffer {
  /** Append the tail if `deltaOnly`. Otherwise replace the whole window. */
  update(history: HistoryEntry[], deltaOnly?: boolean): void;
  get(): TpsSnapshot;
}

export function createTpsBuffer(): TpsBuffer {
  let points: TpsDataPoint[] = [];
  let maxTotalY = 0;

  return {
    update(history, deltaOnly) {
      if (!deltaOnly) points = [];

      for (const h of history) {
        const [total, vote, success, failed] = h.values;
        points.push({ ts: h.ts, tps: { total, vote, success, failed } });
      }

      const newest = points[points.length - 1];
      if (!newest) {
        maxTotalY = 0;
        return;
      }

      // Keep one point past the window so lines/areas render to the left edge.
      const windowStart = newest.ts - tpsRenderWindowMs;
      while (points.length > 1 && points[1].ts < windowStart) points.shift();

      maxTotalY = points.reduce(
        (max, p) => (p.ts >= windowStart ? Math.max(max, p.tps.total) : max),
        0,
      );
    },

    get() {
      return { points, maxTotalY };
    },
  };
}

export const tpsBuffer = createTpsBuffer();
