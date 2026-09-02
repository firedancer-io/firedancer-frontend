import type { HistoryEntry } from "../../../api/worker/types";
import type { EstimatedTps } from "../../../api/types";
import { tpsRenderWindowMs } from "../../../api/worker/cache/consts";

export interface TpsDataPoint {
  /** Worker-clock ts. Rebase with `clockOffsetMs` at render time. */
  ts: number;
  tps: EstimatedTps;
}

export interface TpsBuffer {
  /** Append the tail if `deltaOnly`. Otherwise replace the whole window. */
  update(history: HistoryEntry[], deltaOnly?: boolean): void;
  get(): { points: TpsDataPoint[]; clockOffsetMs: number };
}

export function createTpsBuffer(): TpsBuffer {
  let points: TpsDataPoint[] = [];
  /** Worker timestamps use a different clock than the main thread, so only the
   *  relative ts deltas are meaningful. Add this offset to every point at render
   *  to pin the newest point to the main clock. */
  let clockOffsetMs = 0;

  return {
    update(history, deltaOnly) {
      if (!deltaOnly) points = [];

      for (const h of history) {
        const [total, vote, success, failed] = h.values;
        points.push({ ts: h.ts, tps: { total, vote, success, failed } });
      }

      const newest = points[points.length - 1];
      if (!newest) return;

      clockOffsetMs = performance.now() - newest.ts;

      // Keep one point past the window so lines/areas render to the left edge.
      const cutoff = newest.ts - tpsRenderWindowMs;
      while (points.length > 1 && points[1].ts < cutoff) points.shift();
    },

    get() {
      return { points, clockOffsetMs };
    },
  };
}

export const tpsBuffer = createTpsBuffer();
