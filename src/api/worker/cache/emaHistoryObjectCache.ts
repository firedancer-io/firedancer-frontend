import type { EmaObjectItem, ObjectHistoryEntry } from "../types";
import { createRingBuffer, type RingBuffer } from "../../../ringBuffer";
import { createBatchPublisher, type PublisherEntry } from "./batchPublisher";
import { createEmaCalc, type EmaCalc, type EmaCalcOptions } from "./emaCalc";
import type { HistoryArrayOptions } from "./historyArrayCache";

type ObjectValue = Record<string, number>;

export type EmaHistoryObjectCacheOptions = EmaCalcOptions &
  HistoryArrayOptions & { fields: string[] };

interface EmaHistoryObjectCacheEntry extends PublisherEntry {
  fields: string[];
  calcs: Record<string, EmaCalc>;
  history: RingBuffer<ObjectHistoryEntry<ObjectValue>>;
}

/** Cache for object-valued cumulative metrics with per-field EMA smoothing and sliding history. */
export function createEmaHistoryObjectCache(
  post: (items: EmaObjectItem<ObjectValue, string>[]) => void,
) {
  function getValue(e: EmaHistoryObjectCacheEntry) {
    const value: ObjectValue = {};
    let hasValue = false;
    for (const field of e.fields) {
      value[field] = e.calcs[field].ema ?? 0;
      if (e.calcs[field].ema !== undefined) {
        hasValue = true;
      }
    }
    return { value, hasValue };
  }

  const publisher = createBatchPublisher<
    EmaHistoryObjectCacheEntry,
    EmaHistoryObjectCacheOptions,
    EmaObjectItem<ObjectValue, string>
  >({
    createEntry: (key, options) => {
      const calcs: Record<string, EmaCalc> = {};
      for (const field of options.fields) {
        calcs[field] = createEmaCalc(options);
      }
      const historyCapacity = Math.ceil(
        options.historyWindowMs / options.publishIntervalMs,
      );
      return {
        key,
        subscribed: false,
        lastPublishMs: 0,
        publishIntervalMs: options.publishIntervalMs,
        fields: options.fields,
        calcs,
        history:
          createRingBuffer<ObjectHistoryEntry<ObjectValue>>(historyCapacity),
      };
    },
    collect: (e, nowMs) => {
      const { value, hasValue } = getValue(e);
      if (hasValue) {
        e.history.push({ ts: nowMs, value });
        return {
          key: e.key,
          value,
          history: e.history.toArray(),
        };
      }
      return undefined;
    },
    post,
    onReset: (e) => {
      for (const field of e.fields) {
        e.calcs[field].reset();
      }
      e.history.clear();
    },
  });

  return {
    ...publisher,

    update(key: string, values: Record<string, unknown>, nowMs: number) {
      const e = publisher.get(key);
      if (e) {
        for (const field of e.fields) {
          const v = values[field];
          if (typeof v === "number") {
            e.calcs[field].tick(v, nowMs);
          }
        }
      }
    },

    get(key: string): ObjectValue | undefined {
      const e = publisher.get(key);
      if (e) {
        const { value, hasValue } = getValue(e);
        if (hasValue) {
          return value;
        }
      }
    },
  };
}
