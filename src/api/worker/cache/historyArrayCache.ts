import type { KeyedValuesWithHistory, HistoryEntry } from "../types";
import { createRingBuffer, type RingBuffer } from "../../../ringBuffer";
import {
  createBatchPublisher,
  type PublisherEntry,
  type PublisherOptions,
} from "./batchPublisher";

export interface HistoryArrayOptions extends PublisherOptions {
  historyWindowMs: number;
}

interface HistoryArrayCacheEntry<K extends string> extends PublisherEntry<K> {
  values: number[];
  /** Ring buffer so no re-allocation after initial sizing.
   *  Follows a sliding window for live sparklines. */
  history: RingBuffer<HistoryEntry>;
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
      };
    },
    collect: (e, nowMs) => {
      if (e.values.length > 0) {
        const values = [...e.values];
        e.history.push({ ts: nowMs, values });
        return { key: e.key, values, history: e.history.toArray() };
      }
      return undefined;
    },
    post,
    onReset: (e) => {
      e.values = [];
      e.history.clear();
    },
  });

  return {
    ...publisher,

    update(key: K, values: number[]) {
      const e = publisher.get(key);
      if (e) {
        e.values = values;
      }
    },

    get(key: K) {
      return publisher.get(key)?.values;
    },
  };
}
