import type { EmaItem } from "../types";
import { createBatchPublisher, type PublisherEntry } from "./batchPublisher";
import { createEmaCalc, type EmaCalc, type EmaCalcOptions } from "./emaCalc";
import type { PublisherOptions } from "./batchPublisher";

type EmaCacheOptions = EmaCalcOptions & PublisherOptions;

interface EmaCacheEntry extends PublisherEntry {
  calc: EmaCalc;
}

export function createEmaCache(post: (items: EmaItem[]) => void) {
  const publisher = createBatchPublisher<
    EmaCacheEntry,
    EmaCacheOptions,
    EmaItem
  >({
    createEntry: (key, options) => {
      return {
        key,
        subscribed: false,
        lastPublishMs: 0,
        publishIntervalMs: options.publishIntervalMs,
        calc: createEmaCalc(options),
      };
    },
    collect: (e, nowMs) => {
      e.calc.tick(null, nowMs);
      if (e.calc.ema !== undefined) {
        return { key: e.key, value: e.calc.ema };
      }
      return undefined;
    },
    post,
    onReset: (e) => {
      e.calc.reset();
    },
  });

  return {
    ...publisher,

    update(key: string, cumulativeValue: number, nowMs: number) {
      const e = publisher.get(key);
      if (e) {
        e.calc.tick(cumulativeValue, nowMs);
      }
    },

    get(key: string) {
      return publisher.get(key)?.calc.ema;
    },
  };
}
