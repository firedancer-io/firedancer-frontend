import {
  createHistoryArrayCache,
  type HistoryArrayOptions,
} from "./cache/historyArrayCache";
import {
  createEmaHistoryObjectCache,
  type EmaHistoryObjectCacheOptions,
} from "./cache/emaHistoryObjectCache";
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
  defaultValidatorState,
  type FromWorkerMessage,
  type HistoryArrayKey,
  type WsEntity,
} from "./types";

const gossipHealthEmaOptions: EmaHistoryObjectCacheOptions = {
  halfLifeMs: 5_000,
  initMinSamples: 10,
  warmupMs: 10_000,
  publishIntervalMs: gossipHealthPublishIntervalMs,
  historyWindowMs: gossipHealthRenderWindowMs + gossipHealthHistoryBufferMs,
  fields: [...gossipHealthEmaFields],
};

const tileTimerOptions: HistoryArrayOptions = {
  publishIntervalMs: overviewPublishIntervalMs,
  historyWindowMs: overviewRenderWindowMs + overviewHistoryBufferMs,
};

const networkMetricsOptions: HistoryArrayOptions = {
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
  const emaObjectCache = createEmaHistoryObjectCache((items) =>
    post({ type: "emaHistoryObject", items }),
  );
  const historyArrayCache = createHistoryArrayCache<HistoryArrayKey>((items) =>
    post({ type: "historyArray", items }),
  );

  let validatorState = { ...defaultValidatorState };

  return {
    onConnectionChange(msg: {
      type: "connected" | "connecting" | "disconnected";
    }): void {
      if (msg.type !== "connected") {
        validatorState = { ...defaultValidatorState };
      }
      post(msg);
    },
    onMessage(item: WsEntity): void {
      const nowMs = performance.now();

      if (isEntry(item, "summary", "server_time_nanos")) {
        validatorState = {
          ...validatorState,
          serverTimeNanos: item.value,
        };
      }
      if (
        isEntry(item, "summary", "startup_progress") ||
        isEntry(item, "summary", "boot_progress")
      ) {
        validatorState = {
          ...validatorState,
          isStartup: item.value.phase !== "running",
        };
      }

      if (isEntry(item, "gossip", "network_stats")) {
        emaObjectCache.subscribe("gossipHealth", gossipHealthEmaOptions);
        emaObjectCache.update("gossipHealth", item.value.health, nowMs);
      }

      if (isEntry(item, "summary", "live_network_metrics")) {
        historyArrayCache.subscribe(
          "liveNetworkMetricsIngress",
          networkMetricsOptions,
        );
        historyArrayCache.update(
          "liveNetworkMetricsIngress",
          item.value.ingress_ema,
        );

        historyArrayCache.subscribe(
          "liveNetworkMetricsEgress",
          networkMetricsOptions,
        );
        historyArrayCache.update(
          "liveNetworkMetricsEgress",
          item.value.egress_ema,
        );
      }

      if (isEntry(item, "summary", "live_tile_timers")) {
        historyArrayCache.subscribe("tileTimers", tileTimerOptions);
        historyArrayCache.update("tileTimers", item.value);
      }
    },
  };
}
