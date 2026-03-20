import type { KeyedValuesWithHistory, HistoryEntry } from "../types";
import { createRingBuffer, type RingBuffer } from "../../../ringBuffer";
import { createBatchPublisher, type PublisherEntry } from "./batchPublisher";
import {
  createEmaArrayCalc,
  type EmaArrayCalc,
  type EmaCalcOptions,
} from "./emaCalc";
import type { HistoryArrayOptions } from "./historyArrayCache";

type EmaHistoryArrayCacheOptions = EmaCalcOptions & HistoryArrayOptions;

interface EmaHistoryArrayCacheEntry<K extends string>
  extends PublisherEntry<K> {
  calc: EmaArrayCalc;
  history: RingBuffer<HistoryEntry>;
}

/** Cache for array-valued cumulative metrics with EMA smoothing and sliding history. */
export function createEmaHistoryArrayCache<K extends string>(
  post: (items: KeyedValuesWithHistory<K>[]) => void,
) {
  const publisher = createBatchPublisher<
    EmaHistoryArrayCacheEntry<K>,
    EmaHistoryArrayCacheOptions,
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
        calc: createEmaArrayCalc(options),
        history: createRingBuffer<HistoryEntry>(historyCapacity),
      };
    },
    collect: (e, nowMs) => {
      e.calc.tick(null, nowMs);
      if (e.calc.ema.length > 0) {
        const values = [...e.calc.ema];
        e.history.push({ ts: nowMs, values });
        return { key: e.key, values, history: e.history.toArray() };
      }
      return undefined;
    },
    post,
    onReset: (e) => {
      e.calc.reset();
      e.history.clear();
    },
  });

  return {
    ...publisher,

    update(key: K, values: number[], nowMs: number) {
      const e = publisher.get(key);
      if (e) {
        e.calc.tick(values, nowMs);
      }
    },

    get(key: K) {
      return publisher.get(key)?.calc.ema;
    },
  };
}
