import { nsPerMs } from "../../consts.ts";
import { DEFAULT_WINDOW_MS } from "./const.ts";
import { clamp } from "../../uplotReact/utils.ts";
import type { TsRange } from "../WebGl/webglUtils.ts";
import { convertToNsTimestamp } from "../../mathUtils.ts";
import { useServerMessages } from "../../api/ws/utils.ts";
import type { WsEntity } from "../../api/worker/types.ts";

export function getInitVisibleRange(
  selectedMs: number | undefined,
  worldEndMs: number,
): TsRange {
  if (selectedMs == null) {
    // show right most data
    return [Math.max(0, worldEndMs - DEFAULT_WINDOW_MS), worldEndMs];
  }

  // try to center around selected ts
  return clamp(
    DEFAULT_WINDOW_MS,
    selectedMs - DEFAULT_WINDOW_MS / 2,
    selectedMs + DEFAULT_WINDOW_MS / 2,
    worldEndMs,
    0,
    worldEndMs,
  );
}

export function calcRelativeMs(referenceNs: bigint, valueNs: bigint) {
  return Number(valueNs - referenceNs) / nsPerMs;
}

export function calcAbsoluteNs(referenceNs: bigint, relativeMs: number) {
  return referenceNs + convertToNsTimestamp(relativeMs);
}

type TimelineEntityForKey<TKey extends string> = Extract<
  WsEntity,
  { topic: "timeline"; key: TKey }
>;

function isTimelineKey<TKey extends string>(
  message: WsEntity,
  key: TKey,
): message is TimelineEntityForKey<TKey> {
  return message.topic === "timeline" && message.key === key;
}

export function useTimelineServerMessage<TKey extends string>(
  key: TKey,
  onMessage: (message: TimelineEntityForKey<TKey>) => void,
) {
  useServerMessages((message) => {
    if (message.type === "kv" && isTimelineKey(message, key)) {
      onMessage(message);
    } else if (message.type === "kvb") {
      for (const item of message.items) {
        if (isTimelineKey(item, key)) {
          onMessage(item);
        }
      }
    }
  });
}
