import { useCallback, useEffect, useReducer, useRef } from "react";
import { socketStateAtom } from "./ws/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type {
  EmaHistoryArrayKey,
  EmaObjectItem,
  FromWorkerMessage,
  HistoryArrayKey,
  KeyedValuesWithHistory,
  WsEntity,
} from "./worker/types";
import { isEmaObjectKey } from "./worker/types";
import { DateTime } from "luxon";
import { useInterval } from "react-use";
import { useThrottledCallback, useDebouncedCallback } from "use-debounce";
import type z from "zod";
import {
  skipRateAtom,
  setSlotResponseAtom,
  epochAtom,
  setSlotStatusAtom,
  updatePeersAtom,
  removePeersAtom,
  addSkippedClusterSlotsAtom,
  deleteSkippedClusterSlotAtom,
  addLateVoteSlotAtom,
  deleteLateVoteSlotAtom,
  clearLateVoteSlotsAtom,
  setLateVoteHistoryAtom,
  deleteSkippedClusterSlotsRangeAtom,
  deleteSlotResponseBoundsAtom,
  deleteSlotStatusBoundsAtom,
  deletePreviousEpochsAtom,
} from "../atoms";
import { shredsAtoms } from "../features/Overview/ShredsProgression/atoms";
import { rateLiveWaterfallAtom } from "../features/Overview/SlotPerformance/atoms";
import {
  addTurbineSlotsAtom,
  addRepairSlotsAtom,
  resetRepairSlotsAtom,
  resetTurbineSlotsAtom,
} from "../features/StartupProgress/Firedancer/CatchingUp/atoms";
import { hasLateVote, slowDateTimeNow } from "../utils";
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
} from "./atoms";
import {
  estimatedTpsDebounceMs,
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
import { SocketState } from "./ws/types";
import { xRangeMs } from "../features/Overview/ShredsProgression/const";
import { showStartupProgressAtom } from "../features/StartupProgress/atoms";
import { useServerMessages } from "./ws/utils";

export function useSetAtomWsData() {
  const setSocketState = useSetAtom(socketStateAtom);

  const updateAtoms = useUpdateAtoms();

  const setNetworkMetricsEmaIngress = useSetAtom(networkMetricsEmaIngressAtom);
  const setNetworkMetricsEmaEgress = useSetAtom(networkMetricsEmaEgressAtom);
  const setTileTimerHistory = useSetAtom(tileTimerHistoryAtom);
  const setGossipHealthEma = useSetAtom(gossipHealthEmaAtom);

  const updateEmaHistoryObject = useCallback(
    (item: EmaObjectItem<Record<string, number>, string>) => {
      if (isEmaObjectKey(item, "gossipHealth")) {
        setGossipHealthEma({ value: item.value, history: item.history });
      }
    },
    [setGossipHealthEma],
  );

  const updateEmaHistoryArray = useCallback(
    ({ key, values, history }: KeyedValuesWithHistory<EmaHistoryArrayKey>) => {
      switch (key) {
        case "ingress":
          setNetworkMetricsEmaIngress({ values, history });
          break;
        case "egress":
          setNetworkMetricsEmaEgress({ values, history });
          break;
      }
    },
    [setNetworkMetricsEmaIngress, setNetworkMetricsEmaEgress],
  );

  const updateHistoryArray = useCallback(
    ({ key, values, history }: KeyedValuesWithHistory<HistoryArrayKey>) => {
      switch (key) {
        case "tileTimers":
          setTileTimerHistory({ values, history });
          break;
      }
    },
    [setTileTimerHistory],
  );

  const onMessage = useCallback(
    (msg: FromWorkerMessage) => {
      switch (msg.type) {
        case "connected":
          setSocketState(SocketState.Connected);
          break;
        case "connecting":
          setSocketState(SocketState.Connecting);
          break;
        case "disconnected":
          setSocketState(SocketState.Disconnected);
          break;
        case "kvb":
          for (const item of msg.items) {
            updateAtoms(item);
          }
          break;
        case "kv":
          updateAtoms(msg);
          break;
        // currently unused, would map to EmaCache object
        case "ema":
          break;
        case "emaHistoryArray":
          for (const item of msg.items) {
            updateEmaHistoryArray(item);
          }
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
    },
    [
      setSocketState,
      updateAtoms,
      updateEmaHistoryArray,
      updateHistoryArray,
      updateEmaHistoryObject,
    ],
  );

  useServerMessages(onMessage);
}

function useUpdateAtoms() {
  const setVersion = useSetAtom(versionAtom);
  const setCluster = useSetAtom(clusterAtom);
  const setCommitHash = useSetAtom(commitHashAtom);
  const setIdentityKey = useSetAtom(identityKeyAtom);

  const setTiles = useSetAtom(tilesAtom);

  const setIdentityBalance = useSetAtom(identityBalanceAtom);
  const setVoteBalance = useSetAtom(voteBalanceAtom);
  const setScheduleStrategy = useSetAtom(scheduleStrategyAtom);

  const [startupTime, setStartupTime] = useAtom(startupTimeAtom);

  const [slotDurationDbMs, updateSlotDurationDbMs] = useReducer(() => {
    const uptimeDuration =
      startupTime !== undefined
        ? slowDateTimeNow.diff(
            DateTime.fromMillis(
              Math.floor(Number(startupTime.startupTimeNanos) / 1_000_000),
            ),
          )
        : undefined;

    const uptimeMins =
      uptimeDuration !== undefined ? uptimeDuration.as("minutes") : undefined;
    return uptimeMins !== undefined && uptimeMins > 5 ? 1_000 * 60 : 1_000;
  }, 1_000);

  useInterval(updateSlotDurationDbMs, 1_000);

  const setEstimatedSlotDuration = useSetAtom(estimatedSlotDurationAtom);
  const setDbEstimatedSlotDuration = useThrottledCallback(
    (value?: EstimatedSlotDuration) => setEstimatedSlotDuration(value),
    slotDurationDbMs,
  );

  const setEstimatedTps = useSetAtom(estimatedTpsAtom);
  const setDbEstimatedTps = useThrottledCallback((value?: EstimatedTps) => {
    setEstimatedTps(value);
  }, estimatedTpsDebounceMs);

  const setLiveNetworkMetrics = useSetAtom(liveNetworkMetricsAtom);
  const setDbLiveNetworkMetrics = useThrottledCallback(
    (value?: LiveNetworkMetrics) => {
      setLiveNetworkMetrics(value);
    },
    liveNetworkMetricsDebounceMs,
  );

  const setLiveTileMetrics = useSetAtom(liveTileMetricsAtom);
  const setDbLiveTileMetrics = useThrottledCallback((value?: TileMetrics) => {
    setLiveTileMetrics(value);
  }, liveTileMetricsDebounceMs);

  const setLivePrimaryMetrics = useSetAtom(liveTilePrimaryMetricAtom);
  const setDbLivePrimaryMetrics = useThrottledCallback(
    (value?: LiveTilePrimaryMetric) => {
      setLivePrimaryMetrics(value);
    },
    liveMetricsDebounceMs,
  );

  const setRateLiveTxnWaterfall = useSetAtom(rateLiveWaterfallAtom);
  const setLiveTxnWaterfall = useSetAtom(liveTxnWaterfallAtom);
  const setDbLiveTxnWaterfall = useThrottledCallback(
    (value?: LiveTxnWaterfall) => {
      setLiveTxnWaterfall(value);
      setRateLiveTxnWaterfall(value?.waterfall);
    },
    waterfallDebounceMs,
  );

  const setTileTimer = useSetAtom(tileTimerAtom);
  const setDbTileTimer = useThrottledCallback((value?: number[]) => {
    setTileTimer(value);
  }, tileTimerDebounceMs);

  const setBootProgress = useSetAtom(bootProgressAtom);
  const setStartupProgress = useSetAtom(startupProgressAtom);

  const setTpsHistory = useSetAtom(tpsHistoryAtom);

  const setVoteState = useSetAtom(voteStateAtom);
  const setVoteDistance = useSetAtom(voteDistanceAtom);
  const setSkipRate = useSetAtom(skipRateAtom);

  const setSkippedSlots = useSetAtom(skippedSlotsAtom);
  const setSlotResponse = useSetAtom(setSlotResponseAtom);
  const setSlotRankings = useSetAtom(slotRankingsAtom);

  const [epoch, setEpoch] = useAtom(epochAtom);

  const setSlotStatus = useSetAtom(setSlotStatusAtom);

  const setGossipNetworkStats = useSetAtom(gossipNetworkStatsAtom);
  const setDbGossipNetworkStats = useThrottledCallback(
    (value?: GossipNetworkStats) => {
      setGossipNetworkStats(value);
    },
    gossipNetworkDebounceMs,
  );

  const setGossipPeersSize = useSetAtom(gossipPeersSizeAtom);
  const setDbGossipPeersSize = useThrottledCallback(
    (value?: GossipPeersSize) => {
      setGossipPeersSize(value);
    },
    gossipPeerSizeDebounceMs,
  );
  const setGossipPeersRows = useSetAtom(gossipPeersRowsUpdateAtom);
  const setGossipPeersCells = useSetAtom(gossipPeersCellUpdateAtom);

  const updatePeers = useSetAtom(updatePeersAtom);
  const removePeers = useSetAtom(removePeersAtom);

  const setBlockEngine = useSetAtom(blockEngineAtom);

  const setCompletedSlot = useSetAtom(completedSlotAtom);
  const setServerTimeNanos = useSetAtom(serverTimeNanosAtom);

  const addSkippedClusterSlots = useSetAtom(addSkippedClusterSlotsAtom);
  const deleteSkippedClusterSlot = useSetAtom(deleteSkippedClusterSlotAtom);

  const addLateVoteSlots = useSetAtom(addLateVoteSlotAtom);
  const deleteLateVoteSlot = useSetAtom(deleteLateVoteSlotAtom);
  const clearLateVoteSlots = useSetAtom(clearLateVoteSlotsAtom);
  const setLateVoteHistory = useSetAtom(setLateVoteHistoryAtom);

  const handleSlotUpdate = useCallback(
    (value: SlotResponse) => {
      setSlotStatus(value.publish.slot, value.publish.level);

      if (value.publish.skipped) {
        addSkippedClusterSlots([value.publish.slot]);
      } else {
        deleteSkippedClusterSlot(value.publish.slot);
      }

      if (value.publish.level === "rooted") {
        if (hasLateVote(value.publish)) {
          addLateVoteSlots(value.publish.slot, value.publish.vote_latency);
        } else {
          deleteLateVoteSlot(value.publish.slot);
        }
      }

      if (value.publish.mine) {
        if (value.publish.skipped) {
          setSkippedSlots((prev) =>
            [
              ...(prev ?? []).filter((slot) => slot !== value.publish.slot),
              value.publish.slot,
            ].sort(),
          );
        } else {
          setSkippedSlots((prev) => {
            if (prev?.some((slot) => slot === value.publish.slot)) {
              return prev?.filter((slot) => slot !== value.publish.slot);
            } else {
              return prev;
            }
          });
        }
      }
    },
    [
      addLateVoteSlots,
      addSkippedClusterSlots,
      deleteLateVoteSlot,
      deleteSkippedClusterSlot,
      setSkippedSlots,
      setSlotStatus,
    ],
  );

  const setTurbineSlot = useSetAtom(turbineSlotAtom);
  const addTurbineSlots = useSetAtom(addTurbineSlotsAtom);
  const addTurbineSlot = useCallback(
    (slot: TurbineSlot) => {
      setTurbineSlot(slot);
      if (slot == null) return;
      addTurbineSlots([slot]);
    },
    [addTurbineSlots, setTurbineSlot],
  );

  const setRepairSlot = useSetAtom(repairSlotAtom);
  const addRepairSlots = useSetAtom(addRepairSlotsAtom);
  const addRepairSlot = useCallback(
    (slot: RepairSlot) => {
      setRepairSlot(slot);
      if (slot == null) return;
      addRepairSlots([slot]);
    },
    [addRepairSlots, setRepairSlot],
  );

  const setResetSlot = useSetAtom(resetSlotAtom);
  const setStorageSlot = useSetAtom(storageSlotAtom);
  const setVoteSlot = useSetAtom(voteSlotAtom);
  const setRootSlot = useSetAtom(rootSlotAtom);
  const setOptimisticallyConfirmedSlot = useSetAtom(
    optimisticallyConfirmedSlotAtom,
  );

  const addLiveShreds = useSetAtom(shredsAtoms.addShredEvents);

  const peersBuffer = useRef(new Map<string, Peer>());
  const removePeersBuffer = useRef(new Map<string, PeerRemove>());

  const dbFlushBuffer = useDebouncedCallback(
    () => {
      updatePeers([...peersBuffer.current.values()]);
      removePeers([...removePeersBuffer.current.values()]);
      peersBuffer.current.clear();
      removePeersBuffer.current.clear();
    },
    1_000,
    { maxWait: 1_000 },
  );

  const addToPeersBuffer = useCallback(
    (value: z.infer<typeof peersSchema>["value"]) => {
      if (value.add) {
        for (const add of value.add) {
          peersBuffer.current.set(add.identity_pubkey, add);
          removePeersBuffer.current.delete(add.identity_pubkey);
        }
      }
      // todo: might need to fix updates overwriting with nulls
      if (value.update) {
        for (const update of value.update) {
          peersBuffer.current.set(update.identity_pubkey, update);
        }
      }
      if (value.remove) {
        for (const remove of value.remove) {
          peersBuffer.current.delete(remove.identity_pubkey);
          removePeersBuffer.current.set(remove.identity_pubkey, remove);
        }
      }

      dbFlushBuffer();
    },
    [dbFlushBuffer],
  );

  const updateAtoms = useCallback(
    (item: WsEntity) => {
      const { topic, key, value } = item;
      switch (topic) {
        case "summary":
          switch (key) {
            case "version": {
              setVersion(value);
              break;
            }
            case "cluster": {
              setCluster(value);
              break;
            }
            case "commit_hash": {
              setCommitHash(value);
              break;
            }
            case "identity_key": {
              setIdentityKey(value);
              break;
            }
            case "vote_balance": {
              setVoteBalance(value);
              break;
            }
            case "startup_time_nanos": {
              setStartupTime({ startupTimeNanos: value });
              break;
            }
            case "tiles": {
              setTiles(value);
              break;
            }
            case "schedule_strategy": {
              setScheduleStrategy(value);
              break;
            }
            case "identity_balance": {
              setIdentityBalance(value);
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
              setBootProgress(value);
              break;
            }
            case "startup_progress": {
              setStartupProgress(value);
              break;
            }
            case "tps_history": {
              setTpsHistory(value);
              break;
            }
            case "vote_state": {
              setVoteState(value);
              break;
            }
            case "vote_distance": {
              setVoteDistance(value);
              break;
            }
            case "skip_rate": {
              setSkipRate(value);
              break;
            }
            case "completed_slot": {
              setCompletedSlot(value);
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
              setResetSlot(value);
              break;
            }
            case "storage_slot": {
              setStorageSlot(value);
              break;
            }
            case "vote_slot": {
              setVoteSlot(value);
              break;
            }
            case "root_slot": {
              setRootSlot(value);
              break;
            }
            case "optimistically_confirmed_slot": {
              setOptimisticallyConfirmedSlot(value);
              break;
            }
            case "catch_up_history": {
              addTurbineSlots(value.turbine);
              addRepairSlots(value.repair);
              break;
            }
            case "server_time_nanos": {
              setServerTimeNanos(value);
              break;
            }
            case "live_network_metrics": {
              setDbLiveNetworkMetrics(value);
              break;
            }
            case "live_tile_metrics":
              setDbLiveTileMetrics(value);
              break;
            case "slot_caught_up":
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
              setEpoch(value);
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
              setGossipPeersRows(value);
              break;
            }
            case "view_update": {
              setGossipPeersCells(value);
              break;
            }
          }
          break;
        case "peers":
          addToPeersBuffer(value);
          break;
        case "slot":
          switch (key) {
            case "skipped_history": {
              setSkippedSlots(value.sort());
              break;
            }
            case "skipped_history_cluster": {
              addSkippedClusterSlots(value);
              break;
            }
            case "update":
            case "query": {
              if (value) {
                setSlotResponse(value);
                handleSlotUpdate(value);
              }
              break;
            }
            case "query_rankings": {
              setSlotRankings(value);
              break;
            }
            case "live_shreds": {
              addLiveShreds(value);
              break;
            }
            case "late_votes_history": {
              setLateVoteHistory(value);
              break;
            }
          }
          break;
        case "block_engine": {
          switch (key) {
            case "update": {
              setBlockEngine(value);
              break;
            }
          }
        }
      }
    },
    [
      addLiveShreds,
      addRepairSlot,
      addRepairSlots,
      addSkippedClusterSlots,
      addToPeersBuffer,
      addTurbineSlot,
      addTurbineSlots,
      handleSlotUpdate,
      setBlockEngine,
      setBootProgress,
      setCluster,
      setCommitHash,
      setCompletedSlot,
      setDbEstimatedSlotDuration,
      setDbEstimatedTps,
      setDbGossipNetworkStats,
      setDbGossipPeersSize,
      setDbLiveNetworkMetrics,
      setDbLivePrimaryMetrics,
      setDbLiveTileMetrics,
      setDbLiveTxnWaterfall,
      setDbTileTimer,
      setEpoch,
      setGossipPeersCells,
      setGossipPeersRows,
      setIdentityBalance,
      setIdentityKey,
      setLateVoteHistory,
      setOptimisticallyConfirmedSlot,
      setResetSlot,
      setRootSlot,
      setScheduleStrategy,
      setServerTimeNanos,
      setSkipRate,
      setSkippedSlots,
      setSlotRankings,
      setSlotResponse,
      setStartupProgress,
      setStartupTime,
      setStorageSlot,
      setTiles,
      setTpsHistory,
      setVersion,
      setVoteBalance,
      setVoteDistance,
      setVoteSlot,
      setVoteState,
    ],
  );

  const deleteSlotStatusBounds = useSetAtom(deleteSlotStatusBoundsAtom);
  const deleteSlotResponseBounds = useSetAtom(deleteSlotResponseBoundsAtom);
  const deleteSkippedClusterSlotsRange = useSetAtom(
    deleteSkippedClusterSlotsRangeAtom,
  );
  const deletePreviousEpochs = useSetAtom(deletePreviousEpochsAtom);

  useInterval(() => {
    deleteSlotStatusBounds();
    deleteSlotResponseBounds();

    if (epoch) {
      setSkippedSlots((prev) => {
        return prev?.filter(
          (slot) => slot >= epoch.start_slot && slot <= epoch.end_slot,
        );
      });
    }
  }, 5_000);

  useEffect(() => {
    if (!epoch) return;
    deleteSkippedClusterSlotsRange(epoch.start_slot, epoch.end_slot);
    deletePreviousEpochs(epoch.epoch);
  }, [deleteSkippedClusterSlotsRange, deletePreviousEpochs, epoch]);

  useEffect(() => {
    if (!epoch) return;
    clearLateVoteSlots({
      startSlot: epoch.start_slot,
      endSlot: epoch.end_slot,
    });
  }, [clearLateVoteSlots, epoch]);

  const isStartup = useAtomValue(showStartupProgressAtom);
  const isSocketDisconnected =
    useAtomValue(socketStateAtom) === SocketState.Disconnected;

  const deleteLiveShreds = useSetAtom(shredsAtoms.deleteSlots);

  useEffect(() => {
    if (isSocketDisconnected) {
      deleteLiveShreds(isSocketDisconnected, isStartup);
    }
  }, [deleteLiveShreds, isSocketDisconnected, isStartup]);

  const resetTurbineSlots = useSetAtom(resetTurbineSlotsAtom);
  const resetRepairSlots = useSetAtom(resetRepairSlotsAtom);
  useEffect(() => {
    if (!isStartup) {
      resetTurbineSlots();
      resetRepairSlots();
    }
  }, [isStartup, resetRepairSlots, resetTurbineSlots]);

  useInterval(
    () => {
      deleteLiveShreds(isSocketDisconnected, isStartup);
    },
    isStartup ? 1_000 : xRangeMs / 4,
  );

  return updateAtoms;
}
