import { useCallback } from "react";
import { type TsRange } from "../const";
import { queryMockReplaySlots } from "./mockUtils";

export default function useReplayMiniMapQuery() {
  const query = useCallback((worldRangeMs: TsRange) => {
    const [start, end] = worldRangeMs;
    const range = end - start;
    if (range < 0) return;

    queryMockReplaySlots(start, end);
  }, []);

  return { query };
}
