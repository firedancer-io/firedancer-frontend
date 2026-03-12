import { isDefined } from "../../../utils";

export interface PublisherOptions {
  publishIntervalMs: number;
}

export interface PublisherEntry<K extends string = string> {
  key: K;
  subscribed: boolean;
  lastPublishMs: number;
  publishIntervalMs: number;
}

interface BatchPublisherConfig<
  TEntry extends PublisherEntry<string>,
  TOptions extends PublisherOptions,
  TMessage,
> {
  createEntry: (key: TEntry["key"], options: TOptions) => TEntry;
  /** Called once publishIntervalMs has elapsed since the last publish */
  collect: (entry: TEntry, nowMs: number) => TMessage | undefined;
  /** Sends the collected batch of messages to the main thread. */
  post: (items: TMessage[]) => void;
  onReset?: (entry: TEntry) => void;
}

export function createBatchPublisher<
  TEntry extends PublisherEntry<string>,
  TOptions extends PublisherOptions,
  TMessage,
>(config: BatchPublisherConfig<TEntry, TOptions, TMessage>) {
  const entries = new Map<TEntry["key"], TEntry>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function ensureEntry(key: TEntry["key"], options: TOptions): TEntry {
    let entry = entries.get(key);
    if (!entry) {
      entry = config.createEntry(key, options);
      entries.set(key, entry);
    }
    return entry;
  }

  function nextDueAt(e: TEntry) {
    return e.lastPublishMs + e.publishIntervalMs;
  }

  function schedule() {
    if (timer) return;

    const nowMs = performance.now();
    let nextDue = Infinity;
    for (const e of entries.values()) {
      if (!e.subscribed) continue;

      const entryDue = Math.max(0, nextDueAt(e) - nowMs);
      if (entryDue < nextDue) nextDue = entryDue;
    }
    if (nextDue === Infinity) return;

    timer = setTimeout(
      () => {
        timer = undefined;
        const nowMs = performance.now();
        const batch: TMessage[] = [];

        for (const e of entries.values()) {
          if (!e.subscribed) continue;
          if (nowMs < nextDueAt(e)) continue;

          const item = config.collect(e, nowMs);
          if (item !== undefined) {
            batch.push(item);
          }
          e.lastPublishMs = nowMs;
        }

        if (batch.length) {
          config.post(batch);
        }
        schedule();
      },
      Math.max(0, nextDue),
    );
  }

  return {
    subscribe: (key: TEntry["key"], options: TOptions) => {
      const entry = ensureEntry(key, options);
      if (entry.subscribed) return;
      entry.subscribed = true;
      schedule();
    },

    unsubscribe: (key: TEntry["key"]) => {
      const e = entries.get(key);
      if (e) e.subscribed = false;

      let anySubscribed = false;
      for (const entry of entries.values()) {
        if (entry.subscribed) {
          anySubscribed = true;
          break;
        }
      }

      if (!anySubscribed && timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },

    get: (key: TEntry["key"]) => {
      return entries.get(key);
    },

    reset: (key?: TEntry["key"]) => {
      const toReset = key
        ? [entries.get(key)].filter(isDefined)
        : entries.values();

      for (const e of toReset) {
        config.onReset?.(e);
        e.lastPublishMs = 0;
      }
    },

    stop: () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }

      for (const e of entries.values()) {
        e.subscribed = false;
      }
    },
  };
}
