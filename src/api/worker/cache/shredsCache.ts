import type { LiveShredsItem, ValidatorStateCache } from "../types";
import {
  createBatchPublisher,
  type PublisherEntry,
  type PublisherOptions,
} from "./batchPublisher";
import type { LiveShreds } from "../../types";
import {
  createShredsCalc as createShredsCalc,
  type ShredsCalc,
} from "./shredsCalc";

interface LiveShredsCacheEntry<K extends string> extends PublisherEntry<K> {
  shredsCalc: ShredsCalc;
}

export function createLiveShredsCache<K extends string>(
  post: (items: LiveShredsItem[]) => void,
  validatorStateCache: ValidatorStateCache,
) {
  const publisher = createBatchPublisher<
    LiveShredsCacheEntry<K>,
    PublisherOptions,
    LiveShredsItem
  >({
    createEntry: (key, options) => {
      return {
        key,
        subscribed: false,
        lastPublishMs: 0,
        publishIntervalMs: options.publishIntervalMs,
        shredsCalc: createShredsCalc(validatorStateCache),
      };
    },
    collect: (e) => {
      if (e.shredsCalc.data.slotsShreds) {
        return { key: e.key, data: e.shredsCalc.data };
      }
    },
    post,
    onReset: (e) => {
      e.shredsCalc.reset();
    },
    onStop: (e) => {
      e.shredsCalc.stop();
    },
  });

  return {
    ...publisher,

    add(key: K, liveShreds: LiveShreds) {
      const e = publisher.get(key);
      if (!e) return;
      e.shredsCalc.add(liveShreds);
    },

    get(key: K) {
      return publisher.get(key)?.shredsCalc.data;
    },
  };
}
