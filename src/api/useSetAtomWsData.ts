import { useEffect } from "react";
import { socketStateAtom } from "./ws/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useInterval } from "react-use";
import {
  deleteSkippedClusterSlotsRangeAtom,
  deleteSlotResponseBoundsAtom,
  deleteSlotStatusBoundsAtom,
  deletePreviousEpochsAtom,
  deleteSupermajorityDeltaEntriesAtom,
  resetSupermajorityAtom,
  clearLateVoteSlotsAtom,
  clearMissedVoteSlotsAtom,
  epochAtom,
} from "../atoms";
import { skippedSlotsAtom } from "./atoms";
import { shredsAtoms } from "../features/Overview/ShredsProgression/atoms";
import { xRangeMs } from "./worker/cache/shreds/shredsCalc";
import {
  resetRepairSlotsAtom,
  resetTurbineSlotsAtom,
} from "../features/StartupProgress/Firedancer/CatchingUp/atoms";
import { BootPhaseEnum } from "./entityEnums";
import { SocketState } from "./ws/types";
import { useServerMessages } from "./ws/utils";
import {
  applyWorkerMessage,
  clearSupermajorityPeersBuffers,
} from "./applyWsData";
import {
  showStartupProgressAtom,
  bootProgressPhaseAtom,
} from "../features/StartupProgress/atoms";

/**
 * Worker messages apply at module level (applyWsData.ts) so the first
 * batch can land before React mounts; this hook wires the post-mount
 * emitter path to the same applier and keeps the periodic/reactive
 * cleanup that belongs to the React lifetime.
 */
export function useSetAtomWsData() {
  useServerMessages(applyWorkerMessage);

  const epoch = useAtomValue(epochAtom);
  const setSkippedSlots = useSetAtom(skippedSlotsAtom);

  const deleteSlotStatusBounds = useSetAtom(deleteSlotStatusBoundsAtom);
  const deleteSlotResponseBounds = useSetAtom(deleteSlotResponseBoundsAtom);
  const deleteSkippedClusterSlotsRange = useSetAtom(
    deleteSkippedClusterSlotsRangeAtom,
  );
  const deletePreviousEpochs = useSetAtom(deletePreviousEpochsAtom);
  const clearLateVoteSlots = useSetAtom(clearLateVoteSlotsAtom);
  const clearMissedVoteSlots = useSetAtom(clearMissedVoteSlotsAtom);

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
    clearMissedVoteSlots({
      startSlot: epoch.start_slot,
      endSlot: epoch.end_slot,
    });
  }, [clearLateVoteSlots, clearMissedVoteSlots, epoch]);

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

  const deleteSupermajorityDeltaEntries = useSetAtom(
    deleteSupermajorityDeltaEntriesAtom,
  );
  const resetSupermajority = useSetAtom(resetSupermajorityAtom);
  const bootPhase = useAtomValue(bootProgressPhaseAtom);

  useEffect(() => {
    if (isSocketDisconnected) {
      clearSupermajorityPeersBuffers();
      resetSupermajority();
    }
  }, [isSocketDisconnected, resetSupermajority]);

  useInterval(
    deleteSupermajorityDeltaEntries,
    bootPhase === BootPhaseEnum.waiting_for_supermajority ? 1_000 : null,
  );
}
