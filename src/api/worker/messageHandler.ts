import { createEmaHistoryArrayCache } from "./cache/emaHistoryArrayCache";
import {
  createHistoryArrayCache,
  type HistoryArrayOptions,
} from "./cache/historyArrayCache";
import {
  createEmaHistoryObjectCache,
  type EmaHistoryObjectCacheOptions,
} from "./cache/emaHistoryObjectCache";
import type { EmaCalcOptions } from "./cache/emaCalc";
import {
  gossipHealthPublishIntervalMs,
  gossipHealthRenderWindowMs,
  gossipHealthHistoryBufferMs,
  overviewPublishIntervalMs,
  overviewRenderWindowMs,
  overviewHistoryBufferMs,
} from "./cache/consts";
import { gossipHealthEmaFields } from "../atoms";
import type {
  EmaHistoryArrayKey,
  FromWorkerMessage,
  HistoryArrayKey,
  WsEntity,
} from "./types";

const gossipHealthEmaOptions: EmaHistoryObjectCacheOptions = {
  halfLifeMs: 5_000,
  initMinSamples: 10,
  warmupMs: 10_000,
  publishIntervalMs: gossipHealthPublishIntervalMs,
  historyWindowMs: gossipHealthRenderWindowMs + gossipHealthHistoryBufferMs,
  fields: [...gossipHealthEmaFields],
};

const networkMetricsEmaOptions: EmaCalcOptions & HistoryArrayOptions = {
  halfLifeMs: 1_000,
  initMinSamples: 5,
  warmupMs: 5_000,
  publishIntervalMs: overviewPublishIntervalMs,
  historyWindowMs: overviewRenderWindowMs + overviewHistoryBufferMs,
};

const tileTimerOptions: HistoryArrayOptions = {
  publishIntervalMs: overviewPublishIntervalMs,
  historyWindowMs: overviewRenderWindowMs + overviewHistoryBufferMs,
};

function isEntry<
  T extends WsEntity["topic"],
  K extends Extract<WsEntity, { topic: T }>["key"],
>(
  it: WsEntity,
  topic: T,
  key: K,
): it is Extract<WsEntity, { topic: T; key: K }> {
  return it.topic === topic && it.key === key;
}

export function createMessageHandler(post: (msg: FromWorkerMessage) => void) {
  const emaArrayCache = createEmaHistoryArrayCache<EmaHistoryArrayKey>(
    (items) => post({ type: "emaHistoryArray", items }),
  );
  const emaObjectCache = createEmaHistoryObjectCache((items) =>
    post({ type: "emaHistoryObject", items }),
  );
  const historyArrayCache = createHistoryArrayCache<HistoryArrayKey>((items) =>
    post({ type: "historyArray", items }),
  );

  return {
    onMessage(item: WsEntity): void {
      const nowMs = performance.now();

      if (isEntry(item, "gossip", "network_stats")) {
        emaObjectCache.subscribe("gossipHealth", gossipHealthEmaOptions);
        emaObjectCache.update("gossipHealth", item.value.health, nowMs);
      }

      if (isEntry(item, "summary", "live_network_metrics")) {
        emaArrayCache.subscribe("ingress", networkMetricsEmaOptions);
        emaArrayCache.subscribe("egress", networkMetricsEmaOptions);
        emaArrayCache.update("ingress", item.value.ingress, nowMs);
        emaArrayCache.update("egress", item.value.egress, nowMs);
      }

      if (isEntry(item, "summary", "live_tile_timers")) {
        historyArrayCache.subscribe("tileTimers", tileTimerOptions);
        historyArrayCache.update("tileTimers", item.value);
      }
    },
  };
}
