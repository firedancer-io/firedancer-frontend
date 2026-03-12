import { createEmaCache } from "./cache/emaCache";
import { createEmaHistoryArrayCache } from "./cache/emaHistoryArrayCache";
import {
  createHistoryArrayCache,
  type HistoryArrayOptions,
} from "./cache/historyArrayCache";
import { createEmaHistoryObjectCache } from "./cache/emaHistoryObjectCache";
import type { EmaCalcOptions } from "./cache/emaCalc";
import type { GossipHealthEma } from "../atoms";
import type {
  EmaHistoryArrayKey,
  FromWorkerMessage,
  HistoryArrayKey,
  WsEntity,
} from "./types";

const gossipHealthEmaFields: (keyof GossipHealthEma)[] = [
  "num_push_messages_rx_success",
  "num_push_messages_rx_failure",
  "num_push_entries_rx_success",
  "num_push_entries_rx_failure",
  "num_push_entries_rx_duplicate",
  "num_pull_response_messages_rx_success",
  "num_pull_response_messages_rx_failure",
  "num_pull_response_entries_rx_success",
  "num_pull_response_entries_rx_failure",
  "num_pull_response_entries_rx_duplicate",
];

const gossipHealthEmaOptions: EmaCalcOptions & HistoryArrayOptions = {
  halfLifeMs: 3_000,
  initMinSamples: 5,
  warmupMs: 10_000,
  publishIntervalMs: 300,
  historyWindowMs: 35_000, // 5s buffer beyond render window
};

const networkMetricsEmaOptions: EmaCalcOptions & HistoryArrayOptions = {
  halfLifeMs: 1_000,
  initMinSamples: 5,
  warmupMs: 5_000,
  publishIntervalMs: 500,
  historyWindowMs: 65_000, // 5s buffer beyond render window
};

const tileTimerOptions: HistoryArrayOptions = {
  publishIntervalMs: 500,
  historyWindowMs: 65_000, // 5s buffer beyond render window
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const emaCache = createEmaCache((items) => post({ type: "ema", items }));
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
        emaObjectCache.subscribe(
          "gossipHealth",
          gossipHealthEmaFields,
          gossipHealthEmaOptions,
        );
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
