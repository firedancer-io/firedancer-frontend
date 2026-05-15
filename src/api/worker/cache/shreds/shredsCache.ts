import {
  liveShredsKey,
  type LiveShredsItem,
  type LiveShredsKey,
  type ValidatorState,
} from "../../types";
import {
  createBatchPublisher,
  type PublisherEntry,
  type PublisherOptions,
} from "../batchPublisher";
import type { LiveShreds } from "../../../types";
import { createShredsCalc, type ShredsCalc } from "./shredsCalc";

interface LiveShredsCacheEntry extends PublisherEntry<LiveShredsKey> {
  shredsCalc: ShredsCalc;
}

export function createShredsCache(
  liveShredsOptions: PublisherOptions,
  post: (items: LiveShredsItem[]) => void,
  getValidatorState: () => ValidatorState,
) {
  const publisher = createBatchPublisher<
    LiveShredsCacheEntry,
    PublisherOptions,
    LiveShredsItem
  >({
    createEntry: (key, options) => {
      return {
        key,
        subscribed: false,
        lastPublishMs: 0,
        publishIntervalMs: options.publishIntervalMs,
        shredsCalc: createShredsCalc(getValidatorState),
      };
    },
    collect: (e) => {
      return { key: e.key, data: e.shredsCalc.data };
    },
    post,
    onReset: (e) => {
      e.shredsCalc.resetDataAndClearDeleteTimeout();
    },
    onStop: (e) => {
      e.shredsCalc.resetDataAndClearDeleteTimeout();
    },
  });

  return {
    resetDataAndUnsubscribe() {
      publisher.reset();
      publisher.publishNow(liveShredsKey);
      publisher.unsubscribe(liveShredsKey);
    },

    subscribeAndAdd(liveShreds: LiveShreds) {
      publisher.subscribe(liveShredsKey, liveShredsOptions);
      const e = publisher.get(liveShredsKey);
      if (!e) return;
      e.shredsCalc.add(liveShreds);
    },

    get() {
      return publisher.get(liveShredsKey)?.shredsCalc.data;
    },
  };
}
