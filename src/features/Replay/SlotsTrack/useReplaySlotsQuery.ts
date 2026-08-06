import { useCallback } from "react";
import { slotsThreshold, type TsRange } from "../const";
import {
  queryMockReplaySlots,
  queryMockReplayEpochs,
  MOCK_SLOT_DURATION_MS,
} from "./mockUtils";

const BUFFER_RANGE_MULTIPLIER = 2;

export default function useReplaySlotsQuery() {
  const query = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const [visibleStart, visibleEnd] = visibleRangeMs;
      const range = visibleEnd - visibleStart;
      if (range < 0) return;

      const buffer = range * BUFFER_RANGE_MULTIPLIER;
      const startTsMs = Math.max(visibleStart - buffer, worldRangeMs[0]);
      const endTsMs = Math.min(visibleEnd + buffer, worldRangeMs[1]);

      if (range <= MOCK_SLOT_DURATION_MS * slotsThreshold) {
        queryMockReplaySlots(startTsMs, endTsMs);
      } else {
        queryMockReplayEpochs(startTsMs, endTsMs);
      }
    },
    [],
  );

  return { query };
}
