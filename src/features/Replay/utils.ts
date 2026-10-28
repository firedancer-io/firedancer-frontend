import { nsPerMs } from "../../consts.ts";
import { DEFAULT_WINDOW_MS, nsBucketSizes } from "./const.ts";
import { clamp } from "../../uplotReact/utils.ts";
import type { TsRange } from "../WebGl/webglUtils.ts";
import { convertToNsTimestamp } from "../../mathUtils.ts";
import { useServerMessages } from "../../api/ws/utils.ts";
import { emitter } from "../../api/worker/useWsWorker.ts";
import { messageEventType } from "../../api/ws/ConnectionContext.ts";
import type {
  FromWorkerMessage,
  WsEntity,
  WsError,
} from "../../api/worker/types.ts";
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

type TimelineErrorForKey<TKey extends string> = Extract<
  WsError,
  { topic: "timeline"; key: TKey }
>;

function isTimelineKey<
  TMessage extends { topic: string; key: string },
  TKey extends string,
>(
  message: TMessage,
  key: TKey,
): message is Extract<TMessage, { topic: "timeline"; key: TKey }> {
  return message.topic === "timeline" && message.key === key;
}

function handleTimelineMessage<TKey extends string>(
  message: FromWorkerMessage,
  key: TKey,
  onMessage: (message: TimelineEntityForKey<TKey>) => void,
  onError?: (message: TimelineErrorForKey<TKey>) => void,
) {
  if (message.type === "kv" && isTimelineKey(message, key)) {
    onMessage(message);
  } else if (message.type === "kvb") {
    for (const item of message.items) {
      if (isTimelineKey(item, key)) {
        onMessage(item);
      }
    }
  } else if (
    onError &&
    message.type === "error" &&
    isTimelineKey(message, key)
  ) {
    onError(message);
  }
}

export function useTimelineServerMessage<TKey extends string>(
  key: TKey,
  onMessage: (message: TimelineEntityForKey<TKey>) => void,
  onError?: (message: TimelineErrorForKey<TKey>) => void,
) {
  useServerMessages((message) => {
    handleTimelineMessage(message, key, onMessage, onError);
  });
}

/**
 * Non-hook equivalent of `useTimelineServerMessage`. Subscribes to the message
 * emitter directly and returns an unsubscribe function.
 */
export function subscribeToTimelineMessages<TKey extends string>(
  key: TKey,
  onMessage: (message: TimelineEntityForKey<TKey>) => void,
  onError?: (message: TimelineErrorForKey<TKey>) => void,
): () => void {
  const cb = (message: FromWorkerMessage) => {
    handleTimelineMessage(message, key, onMessage, onError);
  };
  emitter.addListener(messageEventType, cb);
  return () => {
    emitter.removeListener(messageEventType, cb);
  };
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

/**
 * Assumes ts > 0
 */
export function getTileIdx(tsNs: bigint, tileSizeNs: bigint, isEndTs: boolean) {
  const idx = tsNs / tileSizeNs;

  // for end ts on tile boundary, return previous tile idx
  if (isEndTs && idx * tileSizeNs === tsNs) {
    return Number(idx) - 1;
  }
  return Number(idx);
}

/**
 * Get first and last tile idx for the visible range including overscan.
 * Clamp to world range tiles.
 */
export function getTileIdxRangeWithOverscan(
  [visibleStartNs, visibleEndNs]: readonly [bigint, bigint],
  [worldStartNs, worldEndNs]: readonly [bigint, bigint],
  tileSizeNs: bigint,
  overscanTilesCount: number,
): { firstTile: number; lastTile: number } {
  // clamp query to world bounds
  const worldFirstTile = getTileIdx(worldStartNs, tileSizeNs, false);
  const worldLastTile = getTileIdx(worldEndNs, tileSizeNs, true);

  const firstTile = Math.max(
    worldFirstTile,
    getTileIdx(visibleStartNs, tileSizeNs, false) - overscanTilesCount,
  );
  const lastTile = Math.min(
    worldLastTile,
    getTileIdx(visibleEndNs, tileSizeNs, true) + overscanTilesCount,
  );

  return { firstTile, lastTile };
}
