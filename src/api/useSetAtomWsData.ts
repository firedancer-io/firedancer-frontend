import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  identityBalanceAtom,
  blockEngineAtom,
  clusterAtom,
  estimatedSlotDurationAtom,
  estimatedTpsAtom,
  identityKeyAtom,
  commitHashAtom,
  liveTilePrimaryMetricAtom,
  liveTxnWaterfallAtom,
  skippedSlotsAtom,
  startupProgressAtom,
  tilesAtom,
  tileTimerAtom,
  tpsHistoryAtom,
  startupTimeAtom,
  versionAtom,
  voteDistanceAtom,
  voteStateAtom,
  voteBalanceAtom,
  scheduleStrategyAtom,
  slotRankingsAtom,
  bootProgressAtom,
  gossipNetworkStatsAtom,
  completedSlotAtom,
  gossipPeersSizeAtom,
  gossipPeersRowsUpdateAtom,
  gossipPeersCellUpdateAtom,
} from "./atoms";
import {
  blockEngineSchema,
  epochSchema,
  gossipSchema,
  peersSchema,
  slotSchema,
  summarySchema,
  topicSchema,
} from "./entities";
import type { z } from "zod";
import { ZodError } from "zod";
import {
  removePeersAtom,
  setSlotResponseAtom,
  setSlotStatusAtom,
  updatePeersAtom,
  epochAtom,
  deleteSlotStatusBoundsAtom,
  deleteSlotResponseBoundsAtom,
  skipRateAtom,
  addSkippedClusterSlotsAtom,
  deleteSkippedClusterSlotAtom,
  deleteSkippedClusterSlotsRangeAtom,
} from "../atoms";
import type {
  EstimatedSlotDuration,
  EstimatedTps,
  GossipNetworkStats,
  GossipPeersSize,
  LiveTilePrimaryMetric,
  LiveTxnWaterfall,
  Peer,
  PeerRemove,
  RepairSlot,
  SlotResponse,
  TurbineSlot,
} from "./types";
import { useDebouncedCallback, useThrottledCallback } from "use-debounce";
import { useInterval } from "react-use";
import { useServerMessages } from "./ws/utils";
import { DateTime } from "luxon";
import {
  estimatedTpsDebounceMs,
  liveMetricsDebounceMs,
  tileTimerDebounceMs,
  waterfallDebounceMs,
} from "./consts";
import { rateLiveWaterfallAtom } from "../features/Overview/SlotPerformance/atoms";
import { slowDateTimeNow } from "../utils";
import {
  addTurbineSlotsAtom,
  addRepairSlotsAtom,
  resetTurbineSlotsAtom,
  resetRepairSlotsAtom,
} from "../features/StartupProgress/Firedancer/CatchingUp/atoms";
import { shredsAtoms } from "../features/Overview/ShredsProgression/atoms";
import { xRangeMs } from "../features/Overview/ShredsProgression/const";
import { showStartupProgressAtom } from "../features/StartupProgress/atoms";
import { socketStateAtom } from "./ws/atoms";
import { SocketState } from "./ws/types";
import { useEffect, useRef } from "react";

export function useSetAtomWsData() {
  const setVersion = useSetAtom(versionAtom);
  const setCluster = useSetAtom(clusterAtom);
  const setCommitHash = useSetAtom(commitHashAtom);
  const setIdentityKey = useSetAtom(identityKeyAtom);

  const setTiles = useSetAtom(tilesAtom);

  const setIdentityBalance = useSetAtom(identityBalanceAtom);
  const setVoteBalance = useSetAtom(voteBalanceAtom);
  const setScheduleStrategy = useSetAtom(scheduleStrategyAtom);

  const [startupTime, setStartupTime] = useAtom(startupTimeAtom);

  const uptimeDuration =
    startupTime !== undefined
      ? slowDateTimeNow.diff(
          DateTime.fromMillis(
            Math.floor(Number(startupTime.startupTimeNanos) / 1_000_000),
          ),
        )
      : undefined;
  const uptimeMins =
    uptimeDuration !== undefined ? uptimeDuration.get("minutes") : undefined;

  const setEstimatedSlotDuration = useSetAtom(estimatedSlotDurationAtom);
  const setDbEstimatedSlotDuration = useThrottledCallback(
    (value?: EstimatedSlotDuration) => setEstimatedSlotDuration(value),
    uptimeMins !== undefined && uptimeMins > 5 ? 1_000 * 60 : 1_000,
  );

  const setEstimatedTps = useSetAtom(estimatedTpsAtom);
  const setDbEstimatedTps = useThrottledCallback((value?: EstimatedTps) => {
    setEstimatedTps(value);
  }, estimatedTpsDebounceMs);

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
    300,
  );

  const setGossipPeersSize = useSetAtom(gossipPeersSizeAtom);
  const setDbGossipPeersSize = useThrottledCallback(
    (value?: GossipPeersSize) => {
      setGossipPeersSize(value);
    },
    1_000,
  );
  const setGossipPeersRows = useSetAtom(gossipPeersRowsUpdateAtom);
  const setGossipPeersCells = useSetAtom(gossipPeersCellUpdateAtom);

  const updatePeers = useSetAtom(updatePeersAtom);
  const removePeers = useSetAtom(removePeersAtom);

  const setBlockEngine = useSetAtom(blockEngineAtom);

  const setCompletedSlot = useSetAtom(completedSlotAtom);

  const addSkippedClusterSlots = useSetAtom(addSkippedClusterSlotsAtom);
  const deleteSkippedClusterSlot = useSetAtom(deleteSkippedClusterSlotAtom);

  const handleSlotUpdate = (value: SlotResponse) => {
    setSlotStatus(value.publish.slot, value.publish.level);

    if (value.publish.skipped) {
      addSkippedClusterSlots([value.publish.slot]);
    } else {
      deleteSkippedClusterSlot(value.publish.slot);
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
  };

  const addTurbineSlots = useSetAtom(addTurbineSlotsAtom);
  const addTurbineSlot = (slot: TurbineSlot) => {
    if (slot == null) return;
    addTurbineSlots([slot]);
  };

  const addRepairSlots = useSetAtom(addRepairSlotsAtom);
  const addRepairSlot = (slot: RepairSlot) => {
    if (slot == null) return;
    addRepairSlots([slot]);
  };

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

  const addToPeersBuffer = (value: z.infer<typeof peersSchema>["value"]) => {
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
  };

  useServerMessages((msg) => {
    try {
      const { topic } = topicSchema.parse(msg);
      if (topic === "summary") {
        const { key, value } = summarySchema.parse(msg);
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
          case "catch_up_history": {
            addTurbineSlots(value.turbine);
            addRepairSlots(value.repair);
            break;
          }
          case "root_slot":
          case "optimistically_confirmed_slot":
          case "estimated_slot":
          case "ping":
            break;
        }
      } else if (topic === "epoch") {
        const { key, value } = epochSchema.parse(msg);
        switch (key) {
          case "new":
            setEpoch(value);
            break;
        }
      } else if (topic === "gossip") {
        const { key, value } = gossipSchema.parse(msg);
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
      } else if (topic === "peers") {
        const { value } = peersSchema.parse(msg);
        addToPeersBuffer(value);
      } else if (topic === "slot") {
        const { key, value } = slotSchema.parse(msg);
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
        }
      } else if (topic === "block_engine") {
        const { key, value } = blockEngineSchema.parse(msg);
        switch (key) {
          case "update": {
            setBlockEngine(value);
            break;
          }
        }
      } else {
        console.debug(msg);
      }
    } catch (e) {
      if (e instanceof ZodError) {
        if (
          e.errors.every(({ code }) => code === "invalid_union_discriminator")
        ) {
          console.debug(msg);
          console.debug(e.message);
          console.debug(e.errors);
        } else {
          console.error(msg);
          console.error(e.message);
          console.error(e.errors);
        }
      } else {
        console.error(msg);
        console.error(e);
      }
    }
  });

  const deleteSlotStatusBounds = useSetAtom(deleteSlotStatusBoundsAtom);
  const deleteSlotResponseBounds = useSetAtom(deleteSlotResponseBoundsAtom);
  const deleteSkippedClusterSlotsRange = useSetAtom(
    deleteSkippedClusterSlotsRangeAtom,
  );

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
  }, [deleteSkippedClusterSlotsRange, epoch]);

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
}
