import type { KeyedValuesWithHistory, HistoryEntry } from "../types";
import { createRingBuffer, type RingBuffer } from "../../../ringBuffer";
import {
  createBatchPublisher,
  type PublisherEntry,
  type PublisherOptions,
} from "./batchPublisher";

export interface HistoryArrayOptions extends PublisherOptions {
  historyWindowMs: number;
  /** Send the full window once, then only the new tail points each publish
   * (expects the consumer to accumulate points) */
  sendDelta?: boolean;
}

interface HistoryArrayCacheEntry<K extends string> extends PublisherEntry<K> {
  values: number[];
  /** Ring buffer so no re-allocation after initial sizing.
   *  Follows a sliding window for live sparklines. */
  history: RingBuffer<HistoryEntry>;
  lastHistoryPushMs: number;
  sendDelta: boolean;
  /** ts of the newest entry published.
   *  If undefined, send a full history (initial publish or after a seed/reset). */
  lastSentTs: number | undefined;
}

function pushHistory<K extends string>(
  e: HistoryArrayCacheEntry<K>,
  nowMs: number,
) {
  if (e.values.length === 0) return;
  if (nowMs - e.lastHistoryPushMs < e.publishIntervalMs) return;
  e.history.push({ ts: nowMs, values: [...e.values] });
  e.lastHistoryPushMs = nowMs;
}

/** Cache for timestamped historical values that maintains a sliding history window. */
export function createHistoryArrayCache<K extends string>(
  post: (items: KeyedValuesWithHistory<K>[]) => void,
) {
  const publisher = createBatchPublisher<
    HistoryArrayCacheEntry<K>,
    HistoryArrayOptions,
    KeyedValuesWithHistory<K>
  >({
    createEntry: (key, options) => {
      const historyCapacity = Math.ceil(
        options.historyWindowMs / options.publishIntervalMs,
      );
      return {
        key,
        subscribed: false,
        lastPublishMs: 0,
        publishIntervalMs: options.publishIntervalMs,
        values: [],
        history: createRingBuffer<HistoryEntry>(historyCapacity),
        lastHistoryPushMs: 0,
        sendDelta: options.sendDelta ?? false,
        lastSentTs: undefined,
      };
    },
    collect: (e, nowMs) => {
      if (e.values.length === 0) return undefined;

      pushHistory(e, nowMs);
      const values = [...e.values];
      const history = e.history.toArray();

      // Send only deltas
      if (e.sendDelta && e.lastSentTs !== undefined) {
        const tail = history.filter((h) => h.ts > e.lastSentTs!);
        if (tail.length === 0) return undefined;
        e.lastSentTs = history[history.length - 1].ts;
        return { key: e.key, values, history: tail, deltaOnly: true };
      }

      // Send full history
      e.lastSentTs = history[history.length - 1].ts;
      return { key: e.key, values, history };
    },
    post,
    onReset: (e) => {
      e.values = [];
      e.history.clear();
      e.lastHistoryPushMs = 0;
      e.lastSentTs = undefined;
    },
  });

  return {
    ...publisher,

    update(key: K, values: number[]) {
      const e = publisher.get(key);
      if (!e) return;
      e.values = values;
      pushHistory(e, performance.now());
    },

    seed(key: K, entries: HistoryEntry[]) {
      const e = publisher.get(key);
      if (!e || entries.length === 0) return;
      e.history.clear();
      for (const entry of entries) {
        e.history.push(entry);
      }
      const newest = entries[entries.length - 1];
      e.values = newest.values;
      e.lastHistoryPushMs = newest.ts;
      e.lastSentTs = undefined;
    },

    get(key: K) {
      return publisher.get(key)?.values;
    },
  };
}
