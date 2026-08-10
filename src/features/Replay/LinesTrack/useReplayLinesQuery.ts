import { useCallback } from "react";
import type { TsRange } from "../const";
import { queryMockReplayLines } from "./mockUtils";

const BUFFER_RANGE_MULTIPLIER = 2;

export default function useReplayLinesQuery() {
  return useCallback((visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
    const [visibleStart, visibleEnd] = visibleRangeMs;
    const range = visibleEnd - visibleStart;
    if (range < 0) return;

    const buffer = range * BUFFER_RANGE_MULTIPLIER;
    const startTsMs = Math.max(visibleStart - buffer, worldRangeMs[0]);
    const endTsMs = Math.min(visibleEnd + buffer, worldRangeMs[1]);

    queryMockReplayLines(startTsMs, endTsMs);
  }, []);
}
