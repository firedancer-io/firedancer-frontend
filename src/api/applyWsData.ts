import { getDefaultStore, type WritableAtom } from "jotai";
import { enableMapSet } from "immer";
import throttle from "lodash/throttle";
import debounce from "lodash/debounce";
import type { DebouncedFunc } from "lodash";
import { firstFlushAppliedAtom, socketStateAtom } from "./ws/atoms";
import { SocketState } from "./ws/types";
import type {
  EmaObjectItem,
  FromWorkerMessage,
  HistoryArrayKey,
  KeyedValuesWithHistory,
  WsEntity,
} from "./worker/types";
import { isEmaObjectKey } from "./worker/types";
import { DateTime } from "../timeUtils";
import type z from "zod";
import {
  skipRateAtom,
  setSlotResponseAtom,
  epochAtom,
  setSlotStatusAtom,
  updatePeersAtom,
  removePeersAtom,
  serverPeerStatsAtom,
  leadersLiteAtom,
  addSkippedClusterSlotsAtom,
  deleteSkippedClusterSlotAtom,
  addLateVoteSlotAtom,
  deleteLateVoteSlotAtom,
  setLateVoteHistoryAtom,
  addMissedVoteSlotAtom,
  deleteMissedVoteSlotAtom,
  setMissedVoteHistoryAtom,
  supermajorityEpochAtom,
  updateSupermajorityOnlinePeersAtom,
  isDocumentVisibleAtom,
} from "../atoms";
import {
  shredsAtoms,
  setDirtySlotOnSkippedChangeAtom,
} from "../features/Overview/ShredsProgression/atoms";
import { rateLiveWaterfallAtom } from "../features/Overview/SlotPerformance/atoms";
import { isFrankendancer } from "../client";
import {
  addTurbineSlotsAtom,
  addRepairSlotsAtom,
} from "../features/StartupProgress/Firedancer/CatchingUp/atoms";
import { hasLateVote, hasMissedVote, slowDateTimeNow } from "../utils";
import {
  versionAtom,
  clusterAtom,
  commitHashAtom,
  identityKeyAtom,
  tilesAtom,
  identityBalanceAtom,
  voteBalanceAtom,
  scheduleStrategyAtom,
  startupTimeAtom,
  estimatedSlotDurationAtom,
  estimatedTpsAtom,
  liveNetworkMetricsAtom,
  networkMetricsEmaIngressAtom,
  networkMetricsEmaEgressAtom,
  gossipHealthEmaAtom,
  liveTileMetricsAtom,
  liveTilePrimaryMetricAtom,
  liveTxnWaterfallAtom,
  tileTimerAtom,
  tileTimerHistoryAtom,
  bootProgressAtom,
  startupProgressAtom,
  tpsHistoryAtom,
  voteStateAtom,
  voteDistanceAtom,
  skippedSlotsAtom,
  slotRankingsAtom,
  gossipNetworkStatsAtom,
  gossipPeersSizeAtom,
  gossipPeersRowsUpdateAtom,
  gossipPeersCellUpdateAtom,
  blockEngineAtom,
  completedSlotAtom,
  serverTimeNanosAtom,
  turbineSlotAtom,
  repairSlotAtom,
  resetSlotAtom,
  storageSlotAtom,
  voteSlotAtom,
  rootSlotAtom,
  optimisticallyConfirmedSlotAtom,
  liveProgramCacheAtom,
  slotCaughtUpAtom,
  healthAtom,
  accountsStatsAtom,
  voteCommissionAtom,
  notarizedSlotAtom,
  finalizedSlotAtom,
  isAlpenglowAtom,
} from "./atoms";
import {
  tpsSampleIntervalMs,
  liveNetworkMetricsDebounceMs,
  liveTileMetricsDebounceMs,
  liveMetricsDebounceMs,
  waterfallDebounceMs,
  tileTimerDebounceMs,
  gossipNetworkDebounceMs,
  gossipPeerSizeDebounceMs,
} from "./consts";
import type { peersSchema } from "./entities";
import type {
  EstimatedSlotDuration,
  EstimatedTps,
  LiveNetworkMetrics,
  TileMetrics,
  LiveTilePrimaryMetric,
  LiveTxnWaterfall,
  GossipNetworkStats,
  GossipPeersSize,
  SlotResponse,
  TurbineSlot,
  RepairSlot,
  Peer,
  PeerRemove,
} from "./types";

/**
 * Module-level application of worker messages into the module-scoped
 * jotai default store. The first batched ws flush applies here before
 * React mounts, so the mount commit renders with the first-flight data
 * and doubles as the reveal; the mounted hook path
 * (useSetAtomWsData -> useServerMessages) routes later batches through
 * the same functions, keeping one throttle/buffer state machine across
 * the pre-mount/post-mount boundary.
 */

// Applies can run at module level before React mounts (and before
// App.tsx evaluates), so the immer plugin the Set-drafting atoms need
// (catch_up_history -> turbine/repair slot sets) must load here, not in
// App. Without it the first kvb apply throws mid-batch and drops the
// once-per-connect frames behind it (epoch:new).
enableMapSet();

const store = getDefaultStore();

type Callback<A extends unknown[]> = ((...args: A) => void) & {
  cancel: () => void;
};

/**
 * Only run the wrapped throttled/debounced callback while visible.
 * Otherwise, clear the timers and use requestAnimationFrame to call the
 * raw callback on the next frame (rAF is paused while backgrounded, so
 * no timers accumulate).
 */
function ifVisible<A extends unknown[]>(
  fn: (...args: A) => void,
  wrapped: DebouncedFunc<(...args: A) => void>,
): Callback<A> {
  let rafId: number | null = null;
  const call = (...args: A) => {
    if (store.get(isDocumentVisibleAtom)) {
      wrapped(...args);
      return;
    }

    // hidden, don't accumulate timers from wrapped
    wrapped.cancel();
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => fn(...args));
  };
  call.cancel = () => {
    wrapped.cancel();
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  };
  return call;
}

function throttledIfVisible<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Callback<A> {
  return ifVisible(fn, throttle(fn, waitMs));
}

function debouncedIfVisible<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
  options: { maxWait: number },
): Callback<A> {
  return ifVisible(fn, debounce(fn, waitMs, options));
}

function setEstimatedSlotDuration(value?: EstimatedSlotDuration) {
  store.set(estimatedSlotDurationAtom, value);
}

// estimated_slot_duration throttling widens 1s -> 1min once uptime
// passes 5 minutes; recreating the throttle mirrors the old hook's
// interval-driven wait change
let slotDurationDbMs = 1_000;
let setDbEstimatedSlotDuration = throttledIfVisible(
  setEstimatedSlotDuration,
  slotDurationDbMs,
);

setInterval(() => {
  const startupTime = store.get(startupTimeAtom);
  const uptimeMins =
    startupTime !== undefined
      ? slowDateTimeNow
          .diff(
            DateTime.fromMillis(
              Math.floor(Number(startupTime.startupTimeNanos) / 1_000_000),
            ),
          )
          .as("minutes")
      : undefined;
  const waitMs =
    uptimeMins !== undefined && uptimeMins > 5 ? 1_000 * 60 : 1_000;
  if (waitMs === slotDurationDbMs) return;
  slotDurationDbMs = waitMs;
  setDbEstimatedSlotDuration.cancel();
  setDbEstimatedSlotDuration = throttledIfVisible(
    setEstimatedSlotDuration,
    waitMs,
  );
}, 1_000);

const setDbEstimatedTps = throttledIfVisible((value?: EstimatedTps) => {
  store.set(estimatedTpsAtom, value);
}, tpsSampleIntervalMs);

const setDbLiveNetworkMetrics = throttledIfVisible(
  (value?: LiveNetworkMetrics) => {
    store.set(liveNetworkMetricsAtom, value);
  },
  liveNetworkMetricsDebounceMs,
);

const setDbLiveTileMetrics = throttledIfVisible((value?: TileMetrics) => {
  store.set(liveTileMetricsAtom, value);
}, liveTileMetricsDebounceMs);

const setDbLivePrimaryMetrics = throttledIfVisible(
  (value?: LiveTilePrimaryMetric) => {
    store.set(liveTilePrimaryMetricAtom, value);
  },
  liveMetricsDebounceMs,
);

const setDbLiveTxnWaterfall = throttledIfVisible((value?: LiveTxnWaterfall) => {
  store.set(liveTxnWaterfallAtom, value);
  store.set(rateLiveWaterfallAtom, value?.waterfall);
}, waterfallDebounceMs);

const setDbTileTimer = throttledIfVisible((value?: number[]) => {
  store.set(tileTimerAtom, value);
}, tileTimerDebounceMs);

const setDbGossipNetworkStats = throttledIfVisible(
  (value?: GossipNetworkStats) => {
    store.set(gossipNetworkStatsAtom, value);
  },
  gossipNetworkDebounceMs,
);

const setDbGossipPeersSize = throttledIfVisible((value?: GossipPeersSize) => {
  store.set(gossipPeersSizeAtom, value);
}, gossipPeerSizeDebounceMs);

function handleSlotUpdate(value: SlotResponse) {
  store.set(setSlotStatusAtom, value.publish.slot, value.publish.level);

  const slot = value.publish.slot;
  store.set(setDirtySlotOnSkippedChangeAtom, slot, value.publish.skipped);

  if (value.publish.skipped) {
    store.set(addSkippedClusterSlotsAtom, [slot]);
  } else {
    store.set(deleteSkippedClusterSlotAtom, slot);
  }

  if (value.publish.level === "rooted") {
    if (hasLateVote(value.publish)) {
      store.set(
        addLateVoteSlotAtom,
        value.publish.slot,
        value.publish.vote_latency ?? null,
      );
    } else {
      store.set(deleteLateVoteSlotAtom, value.publish.slot);
    }
  }

  if (hasMissedVote(value.publish)) {
    store.set(addMissedVoteSlotAtom, value.publish.slot);
  } else {
    store.set(deleteMissedVoteSlotAtom, value.publish.slot);
  }

  if (value.publish.mine) {
    if (value.publish.skipped) {
      store.set(skippedSlotsAtom, (prev) =>
        [
          ...(prev ?? []).filter((slot) => slot !== value.publish.slot),
          value.publish.slot,
        ].sort(),
      );
    } else {
      store.set(skippedSlotsAtom, (prev) => {
        if (prev?.some((slot) => slot === value.publish.slot)) {
          return prev?.filter((slot) => slot !== value.publish.slot);
        } else {
          return prev;
        }
      });
    }
  }
}

function addTurbineSlot(slot: TurbineSlot) {
  store.set(turbineSlotAtom, slot);
  if (slot == null) return;
  store.set(addTurbineSlotsAtom, [slot]);
}

function addRepairSlot(slot: RepairSlot) {
  store.set(repairSlotAtom, slot);
  if (slot == null) return;
  store.set(addRepairSlotsAtom, [slot]);
}

const peersBuffer = new Map<string, Peer>();
const removePeersBuffer = new Map<string, PeerRemove>();

function flushPeersBuffers() {
  store.set(updatePeersAtom, [...peersBuffer.values()]);
  store.set(removePeersAtom, [...removePeersBuffer.values()]);
  peersBuffer.clear();
  removePeersBuffer.clear();
}

const dbFlushPeersBuffers = debouncedIfVisible(flushPeersBuffers, 1_000, {
  maxWait: 1_000,
});

// First batch applies after the next paint (rAF -> timeout): with the
// pre-mount apply, the paint it yields to is the reveal commit itself,
// so the large initial peers apply never blocks it
let firstPeersFlushPending = true;

function addToPeersBuffer(
  value: Extract<z.infer<typeof peersSchema>, { key: "update" }>["value"],
) {
  if (value.add) {
    for (const add of value.add) {
      peersBuffer.set(add.identity_pubkey, add);
      removePeersBuffer.delete(add.identity_pubkey);
    }
  }
  // todo: might need to fix updates overwriting with nulls
  if (value.update) {
    for (const update of value.update) {
      peersBuffer.set(update.identity_pubkey, update);
    }
  }
  if (value.remove) {
    for (const remove of value.remove) {
      peersBuffer.delete(remove.identity_pubkey);
      removePeersBuffer.set(remove.identity_pubkey, remove);
    }
  }

  if (firstPeersFlushPending) {
    firstPeersFlushPending = false;
    requestAnimationFrame(() => {
      setTimeout(flushPeersBuffers, 0);
    });
    return;
  }

  // only triggers when document is visible
  dbFlushPeersBuffers();
}

const supermajorityPeersBuffers = {
  toAdd: new Set<string>(),
  toRemove: new Set<string>(),
};

const dbFlushSupermajorityPeersBuffers = debouncedIfVisible(
  () => {
    store.set(
      updateSupermajorityOnlinePeersAtom,
      [...supermajorityPeersBuffers.toAdd],
      [...supermajorityPeersBuffers.toRemove],
    );
    supermajorityPeersBuffers.toAdd.clear();
    supermajorityPeersBuffers.toRemove.clear();
  },
  1_000,
  { maxWait: 1_000 },
);

function addToSupermajorityPeersBuffers(isAdd: boolean, peers: string[]) {
  if (isAdd) {
    for (const peer of peers) {
      supermajorityPeersBuffers.toAdd.add(peer);
      supermajorityPeersBuffers.toRemove.delete(peer);
    }
  } else {
    for (const peer of peers) {
      supermajorityPeersBuffers.toAdd.delete(peer);
      supermajorityPeersBuffers.toRemove.add(peer);
    }
  }

  // only triggers when document is visible
  dbFlushSupermajorityPeersBuffers();
}

/** Socket-disconnect cleanup (useSetAtomWsData disconnect effect) */
export function clearSupermajorityPeersBuffers() {
  dbFlushSupermajorityPeersBuffers.cancel();
  supermajorityPeersBuffers.toAdd.clear();
  supermajorityPeersBuffers.toRemove.clear();
}

export function applyWsEntity(item: WsEntity) {
  const { topic, key, value } = item;
  switch (topic) {
    case "summary":
      switch (key) {
        case "version": {
          store.set(versionAtom, value);
          break;
        }
        case "cluster": {
          store.set(clusterAtom, value);
          break;
        }
        case "commit_hash": {
          store.set(commitHashAtom, value);
          break;
        }
        case "identity_key": {
          store.set(identityKeyAtom, value);
          break;
        }
        case "vote_commission": {
          store.set(voteCommissionAtom, value);
          break;
        }
        case "vote_balance": {
          store.set(voteBalanceAtom, value);
          break;
        }
        case "startup_time_nanos": {
          store.set(startupTimeAtom, { startupTimeNanos: value });
          break;
        }
        case "tiles": {
          store.set(tilesAtom, value);
          break;
        }
        case "schedule_strategy": {
          store.set(scheduleStrategyAtom, value);
          break;
        }
        case "identity_balance": {
          store.set(identityBalanceAtom, value);
          break;
        }
        case "estimated_slot_duration_nanos": {
          setDbEstimatedSlotDuration(value);
          break;
        }
        case "estimated_tps": {
          setDbEstimatedTps(value);
          break;
        }
        case "live_tile_primary_metric": {
          setDbLivePrimaryMetrics(value);
          break;
        }
        case "live_txn_waterfall": {
          setDbLiveTxnWaterfall(value);
          break;
        }
        case "live_tile_timers": {
          setDbTileTimer(value);
          break;
        }
        case "boot_progress": {
          store.set(bootProgressAtom, value);
          break;
        }
        case "startup_progress": {
          store.set(startupProgressAtom, value);
          break;
        }
        case "tps_history": {
          store.set(tpsHistoryAtom, value);
          break;
        }
        case "vote_state": {
          store.set(voteStateAtom, value);
          break;
        }
        case "vote_distance": {
          store.set(voteDistanceAtom, value);
          break;
        }
        case "skip_rate": {
          store.set(skipRateAtom, value);
          break;
        }
        case "completed_slot": {
          store.set(completedSlotAtom, value);
          break;
        }
        case "turbine_slot": {
          addTurbineSlot(value);
          break;
        }
        case "repair_slot": {
          addRepairSlot(value);
          break;
        }
        case "reset_slot": {
          store.set(resetSlotAtom, value);
          break;
        }
        case "storage_slot": {
          store.set(storageSlotAtom, value);
          break;
        }
        case "vote_slot": {
          store.set(voteSlotAtom, value);
          break;
        }
        case "root_slot": {
          store.set(rootSlotAtom, value);
          break;
        }
        case "optimistically_confirmed_slot": {
          store.set(optimisticallyConfirmedSlotAtom, value);
          break;
        }
        case "notarized_slot": {
          store.set(notarizedSlotAtom, value);
          break;
        }
        case "finalized_slot": {
          store.set(finalizedSlotAtom, value);
          break;
        }
        case "is_alpenglow":
          store.set(isAlpenglowAtom, value);
          break;
        case "slot_caught_up":
          store.set(slotCaughtUpAtom, value);
          break;
        case "catch_up_history": {
          store.set(addTurbineSlotsAtom, value.turbine);
          store.set(addRepairSlotsAtom, value.repair);
          break;
        }
        case "server_time_nanos": {
          store.set(serverTimeNanosAtom, value);
          break;
        }
        case "live_network_metrics": {
          setDbLiveNetworkMetrics(value);
          break;
        }
        case "live_tile_metrics":
          setDbLiveTileMetrics(value);
          break;
        case "live_program_cache":
          store.set(liveProgramCacheAtom, value);
          break;
        case "health":
          store.set(healthAtom, value);
          break;
        case "estimated_slot":
        case "ping":
        case "vote_key":
        case "active_fork_count":
          break;
      }
      break;
    case "epoch":
      switch (key) {
        case "new":
          store.set(epochAtom, value);
          break;
      }
      break;
    case "gossip":
      switch (key) {
        case "network_stats": {
          setDbGossipNetworkStats(value);
          break;
        }
        case "peers_size_update": {
          setDbGossipPeersSize(value);
          break;
        }
        case "query_scroll":
        case "query_sort": {
          store.set(gossipPeersRowsUpdateAtom, value);
          break;
        }
        case "view_update": {
          store.set(gossipPeersCellUpdateAtom, value);
          break;
        }
      }
      break;
    case "peers":
      switch (key) {
        case "update":
          addToPeersBuffer(value);
          break;
        case "stats":
          // applied immediately (not buffered) so the card renders
          // from the first batch, ahead of the big peers update
          store.set(serverPeerStatsAtom, {
            validatorCount: value.validator_count,
            rpcCount: value.rpc_count,
            activeStake: value.active_stake,
            delinquentStake: value.delinquent_stake,
          });
          break;
        case "leaders":
          // applied immediately (not buffered): the tiny epoch-keyed
          // frame that gives the sidebar names/icons/flags with the
          // first flush, long before the big peers update
          store.set(leadersLiteAtom, (prev) => ({
            ...prev,
            [value.epoch]: value,
          }));
          break;
      }
      break;
    case "slot":
      switch (key) {
        case "skipped_history": {
          store.set(skippedSlotsAtom, value.sort());
          break;
        }
        case "skipped_history_cluster": {
          store.set(addSkippedClusterSlotsAtom, value);
          break;
        }
        case "update":
        case "query":
        case "query_detailed":
        case "query_transactions": {
          if (value) {
            store.set(setSlotResponseAtom, value);
            handleSlotUpdate(value);
          }
          break;
        }
        case "query_rankings": {
          store.set(slotRankingsAtom, value);
          break;
        }
        case "live_shreds": {
          store.set(shredsAtoms.addShredEvents, value);
          break;
        }
        case "missed_vote_history": {
          store.set(setMissedVoteHistoryAtom, value);
          break;
        }
        case "late_votes_history": {
          // runtime-selected FR/FD atom pair; the isFrankendancer guards
          // keep the value shape matched to the picked atom
          const setLateVoteHistory = setLateVoteHistoryAtom as WritableAtom<
            null,
            [value: typeof value],
            void
          >;
          if (isFrankendancer && "latency" in value)
            store.set(setLateVoteHistory, value);
          else if (!isFrankendancer && "latency_exact" in value)
            store.set(setLateVoteHistory, value);
          break;
        }
      }
      break;
    case "block_engine": {
      switch (key) {
        case "update": {
          store.set(blockEngineAtom, value);
          break;
        }
      }
      break;
    }
    case "wait_for_supermajority": {
      switch (key) {
        case "stakes": {
          store.set(supermajorityEpochAtom, value);
          break;
        }
        case "peer_add": {
          addToSupermajorityPeersBuffers(true, value);
          break;
        }
        case "peer_remove": {
          addToSupermajorityPeersBuffers(false, value);
          break;
        }
      }
      break;
    }
    case "accounts": {
      switch (key) {
        case "stats": {
          store.set(accountsStatsAtom, value);
          break;
        }
      }
      break;
    }
  }
}

function updateHistoryArray({
  key,
  values,
  history,
}: KeyedValuesWithHistory<HistoryArrayKey>) {
  switch (key) {
    case "tileTimers":
      store.set(tileTimerHistoryAtom, { values, history });
      break;
    case "liveNetworkMetricsIngress":
      store.set(networkMetricsEmaIngressAtom, { values, history });
      break;
    case "liveNetworkMetricsEgress":
      store.set(networkMetricsEmaEgressAtom, { values, history });
      break;
  }
}

function updateEmaHistoryObject(
  item: EmaObjectItem<Record<string, number>, string>,
) {
  if (isEmaObjectKey(item, "gossipHealth")) {
    store.set(gossipHealthEmaAtom, {
      value: item.value,
      history: item.history,
    });
  }
}

export function applyWorkerMessage(msg: FromWorkerMessage) {
  switch (msg.type) {
    case "connected":
      store.set(socketStateAtom, SocketState.Connected);
      break;
    case "connecting":
      store.set(socketStateAtom, SocketState.Connecting);
      break;
    case "disconnected":
      store.set(socketStateAtom, SocketState.Disconnected);
      break;
    case "kvb":
      for (const item of msg.items) {
        applyWsEntity(item);
      }
      store.set(firstFlushAppliedAtom, true);
      break;
    case "kv":
      applyWsEntity(msg);
      store.set(firstFlushAppliedAtom, true);
      break;
    case "shredsSeed":
      store.set(shredsAtoms.seed, msg.data);
      break;
    // currently unused, would map to EmaCache object
    case "ema":
      break;
    // currently unused, would map to KeyedValuesWithHistory
    case "emaHistoryArray":
      break;
    case "historyArray":
      for (const item of msg.items) {
        updateHistoryArray(item);
      }
      break;
    case "emaHistoryObject":
      for (const item of msg.items) {
        updateEmaHistoryObject(item);
      }
      break;
  }
}
