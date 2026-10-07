import { nsPerMs } from "../../consts.ts";
import { DEFAULT_WINDOW_MS, nsBucketSizes } from "./const.ts";
import { clamp } from "../../uplotReact/utils.ts";
import type { TsRange } from "../WebGl/webglUtils.ts";
import { convertToNsTimestamp } from "../../mathUtils.ts";
import { useServerMessages } from "../../api/ws/utils.ts";
import type { WsEntity } from "../../api/worker/types.ts";
import type { AggGranularity } from "../../api/types.ts";

export function clampToWorld(range: TsRange, worldRange: TsRange) {
  return clamp(
    range[1] - range[0],
    range[0],
    range[1],
    worldRange[1] - worldRange[0],
    worldRange[0],
    worldRange[1],
  );
}

export function getInitVisibleRange(
  selectedMs: number | undefined,
  worldRange: TsRange,
): TsRange {
  if (selectedMs == null) {
    return clampToWorld(
      // show right most data
      [worldRange[1] - DEFAULT_WINDOW_MS, worldRange[1]],
      worldRange,
    );
  }

  // try to center around selected ts
  return clampToWorld(
    [selectedMs - DEFAULT_WINDOW_MS / 2, selectedMs + DEFAULT_WINDOW_MS / 2],
    worldRange,
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

export function getBucketIdx(
  tsNs: bigint,
  granularity: AggGranularity,
  isEndTs: boolean,
) {
  const bucketSizeNs = nsBucketSizes[granularity];
  const idx = tsNs / bucketSizeNs;

  // for end ts on bucket boundary, return previous bucket idx
  if (isEndTs && idx * bucketSizeNs === tsNs) {
    return Number(idx) - 1;
  }
  return Number(idx);
}

export function getTileIdx(tsNs: bigint, tileSizeNs: bigint, isEndTs: boolean) {
  const idx = tsNs / tileSizeNs;

  // for end ts on tile boundary, return previous tile idx
  if (isEndTs && idx * tileSizeNs === tsNs) {
    return Number(idx) - 1;
  }
  return Number(idx);
}
