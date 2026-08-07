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
      const buffer = SHREDS_REQUEST_THRESHOLD_MS - range;
      const start = Math.max(Math.ceil(center - buffer / 2), worldRangeMs[0]);
      const end = Math.min(Math.floor(center + buffer / 2), worldRangeMs[1]);

      wsSend({
        topic: "timeline",
        key: "query_shreds",
        id: 32,
        params: {
          start_ns: getNsStringFromMs(start, "ceil"),
          end_ns: getNsStringFromMs(end, "floor"),
        },
      });
    },
    [wsSend],
  );
}

function getNsStringFromMs(tsMs: number, round: "floor" | "ceil") {
  const intMs = Math.trunc(tsMs);
  // Keep at most 6 fractional digits of ms (ns resolution); round the rest.
  const raw = (tsMs - intMs) * nsPerMs;
  const fracNs = round === "floor" ? Math.floor(raw) : Math.ceil(raw);
  const ns = BigInt(intMs) * 1_000_000n + BigInt(fracNs);

  return ns.toString();
}
