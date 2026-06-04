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
import {
  isEntry,
  type EmaHistoryArrayKey,
  type FromWorkerMessage,
  type HistoryArrayKey,
  type WsEntity,
} from "./types";
import { createEpochCache } from "./cache/epochCache";

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

  const epochCache = createEpochCache(
    (slot) => post({ type: "currentSlot", slot }),
    ({ currentEpoch, nextEpoch }) =>
      post({ type: "epochData", currentEpoch, nextEpoch }),
    (skippedClusterSlots: Set<number>) =>
      post({ type: "skippedClusterSlots", slots: skippedClusterSlots }),
  );

  return {
    onMessage(item: WsEntity): void {
      const nowMs = performance.now();

      if (isEntry(item, "epoch", "new")) {
        epochCache.addEpoch(item.value);
      }

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

      if (
        isEntry(item, "slot", "update") ||
        isEntry(item, "slot", "query") ||
        isEntry(item, "slot", "query_detailed") ||
        isEntry(item, "slot", "query_transactions")
      ) {
        if (item.value) {
          const { slot, level, skipped } = item.value.publish;
          if (
            level === "completed" ||
            level === "optimistically_confirmed" ||
            level === "rooted"
          ) {
            epochCache.setCurrentSlot(slot + 1);
          }
          if (skipped) {
            epochCache.addSkippedClusterSlots([slot]);
          } else {
            epochCache.deleteSkippedClusterSlot(slot);
          }
        }
      }

      if (isEntry(item, "slot", "skipped_history_cluster")) {
        epochCache.addSkippedClusterSlots(item.value);
      }
    },
  };
}
