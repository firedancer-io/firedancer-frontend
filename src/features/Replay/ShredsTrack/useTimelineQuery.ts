import { useCallback } from "react";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { TsRange } from "../const";
import { nsPerMs } from "../../../consts";

const SHREDS_REQUEST_THRESHOLD_MS = 60_000;

export function useTimelineQuery() {
  const wsSend = useWebSocketSend();

  return useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const [visibleStart, visibleEnd] = visibleRangeMs;
      const range = visibleEnd - visibleStart;
      if (range < 0 || range > SHREDS_REQUEST_THRESHOLD_MS) return;

      const center = (visibleStart + visibleEnd) / 2;
      const start = Math.max(
        Math.floor(center - SHREDS_REQUEST_THRESHOLD_MS / 2),
        worldRangeMs[0],
      );
      const end = Math.min(
        Math.ceil(center + SHREDS_REQUEST_THRESHOLD_MS / 2),
        worldRangeMs[1],
      );

      wsSend({
        topic: "timeline",
        key: "query_shreds",
        id: 32,
        params: {
          start_ns: getNsStringFromMs(start),
          end_ns: getNsStringFromMs(end),
        },
      });
    },
    [wsSend],
  );
}

function getNsStringFromMs(tsMs: number) {
  const intMs = Math.trunc(tsMs);
  // Keep at most 6 fractional digits of ms (ns resolution); round the rest.
  const fracNs = Math.round((tsMs - intMs) * nsPerMs);
  const ns = BigInt(intMs) * 1_000_000n + BigInt(fracNs);

  return ns.toString();
}
