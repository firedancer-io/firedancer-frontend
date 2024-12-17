import { useAtom, useSetAtom } from "jotai";
import {
  balanceAtom,
  clusterAtom,
  estimatedSlotDurationAtom,
  estimatedTpsAtom,
  identityKeyAtom,
  liveTilePrimaryMetricAtom,
  liveTxnWaterfallAtom,
  skippedSlotsAtom,
  startupProgressAtom,
  tilesAtom,
  tileTimerAtom,
  tpsHistoryAtom,
  uptimeAtom,
  versionAtom,
  voteDistanceAtom,
  voteStateAtom,
} from "./atoms";
import {
  epochSchema,
  peersSchema,
  slotSchema,
  summarySchema,
  topicSchema,
} from "./entities";
import { ZodError } from "zod";
import {
  addPeersAtom,
  removePeersAtom,
  setSlotResponseAtom,
  setSlotStatusAtom,
  updatePeersAtom,
  epochAtom,
  deleteSlotStatusBoundsAtom,
  deleteSlotResponseBoundsAtom,
  skipRateAtom,
} from "../atoms";
import {
  EstimatedSlotDuration,
  EstimatedTps,
  LiveTilePrimaryMetric,
  LiveTxnWaterfall,
} from "./types";
import { useThrottledCallback } from "use-debounce";
import { useInterval } from "react-use";
import { useServerMessages } from "./ws/utils";
import { DateTime } from "luxon";

const minuteNanos = 1_000_000 * 60 * 1_000;

export function useSetAtomWsData() {
  const setVersion = useSetAtom(versionAtom);
  const setCluster = useSetAtom(clusterAtom);
  const setIdentityKey = useSetAtom(identityKeyAtom);

  const setTiles = useSetAtom(tilesAtom);

  const setBalance = useSetAtom(balanceAtom);

  const [uptime, setUptime] = useAtom(uptimeAtom);
  const uptimeMins =
    uptime !== undefined ? uptime.uptimeNanos / minuteNanos : undefined;

  const setEstimatedSlotDuration = useSetAtom(estimatedSlotDurationAtom);
  const setDbEstimatedSlotDuration = useThrottledCallback(
    (value?: EstimatedSlotDuration) => setEstimatedSlotDuration(value),
    uptimeMins !== undefined && uptimeMins > 5 ? 1_000 * 60 : 1_000
  );

  const setEstimatedTps = useSetAtom(estimatedTpsAtom);
  const setDbEstimatedTps = useThrottledCallback((value?: EstimatedTps) => {
    setEstimatedTps(value);
  }, 400);

  const setLivePrimaryMetrics = useSetAtom(liveTilePrimaryMetricAtom);
  const setDbLivePrimaryMetrics = useThrottledCallback(
    (value?: LiveTilePrimaryMetric) => {
      setLivePrimaryMetrics(value);
    },
    100
  );

  const setLiveTxnWaterfall = useSetAtom(liveTxnWaterfallAtom);
  const setDbLiveTxnWaterfall = useThrottledCallback(
    (value?: LiveTxnWaterfall) => {
      setLiveTxnWaterfall(value);
    },
    100
  );

  const setTileTimer = useSetAtom(tileTimerAtom);
  const setDbTileTimer = useThrottledCallback((value?: number[]) => {
    setTileTimer(value);
  }, 25);

  const setStartupProgress = useSetAtom(startupProgressAtom);

  const setTpsHistory = useSetAtom(tpsHistoryAtom);

  const setVoteState = useSetAtom(voteStateAtom);
  const setVoteDistance = useSetAtom(voteDistanceAtom);
  const setSkipRate = useSetAtom(skipRateAtom);

  const setSkippedSlots = useSetAtom(skippedSlotsAtom);
  const setSlotResponse = useSetAtom(setSlotResponseAtom);

  const [epoch, setEpoch] = useAtom(epochAtom);

  const setSlotStatus = useSetAtom(setSlotStatusAtom);

  const addPeers = useSetAtom(addPeersAtom);
  const updatePeers = useSetAtom(updatePeersAtom);
  const removePeers = useSetAtom(removePeersAtom);

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
          case "identity_key": {
            // setIdentityKey("ftvxmtUHUfpL2TmTDXdX6bLS6DBg5v4JJFuSF45ddd1");
            setIdentityKey(value);
            break;
          }
          case "uptime_nanos": {
            setUptime({ uptimeNanos: value, ts: DateTime.now() });
            break;
          }
          case "tiles": {
            setTiles(value);
            break;
          }
          case "balance": {
            setBalance(value);
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
          case "first_processed_slot":
          case "root_slot":
          case "optimistically_confirmed_slot":
          case "completed_slot":
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
      } else if (topic === "peers") {
        const { value } = peersSchema.parse(msg);
        addPeers(value.add);
        updatePeers(value.update);
        removePeers(value.remove);
      } else if (topic === "slot") {
        const { key, value } = slotSchema.parse(msg);
        switch (key) {
          case "skipped_history": {
            setSkippedSlots(value.sort());
            break;
          }
          case "update":
          case "query": {
            if (value) {
              setSlotStatus(value.publish.slot, value.publish.level);
              setSlotResponse(value);

              if (value.publish.mine) {
                if (value.publish.skipped) {
                  setSkippedSlots((prev) =>
                    [
                      ...(prev ?? []).filter(
                        (slot) => slot !== value.publish.slot
                      ),
                      value.publish.slot,
                    ].sort()
                  );
                } else {
                  setSkippedSlots((prev) => {
                    if (prev?.some((slot) => slot === value.publish.slot)) {
                      return prev?.filter(
                        (slot) => slot !== value.publish.slot
                      );
                    } else {
                      return prev;
                    }
                  });
                }
              }
            }
            break;
          }
        }
      } else {
        console.debug(msg);
      }
    } catch (e) {
      if (e instanceof ZodError) {
        console.debug(msg)
        console.debug(e.message);
        console.debug(e.errors);
      } else {
        console.error(msg);
        console.error(e);
      }
    }
  });

  const deleteSlotStatusBounds = useSetAtom(deleteSlotStatusBoundsAtom);
  const deleteSlotResponseBounds = useSetAtom(deleteSlotResponseBoundsAtom);

  useInterval(() => {
    deleteSlotStatusBounds();
    deleteSlotResponseBounds();

    if (epoch) {
      setSkippedSlots((prev) => {
        return prev?.filter(
          (slot) => slot >= epoch.start_slot && slot <= epoch.end_slot
        );
      });
    }
  }, 5_000);
}
