import type { Epoch } from "../../types";

/**
 * Post on updates
 */
export function createEpochCache(
  postCurrentSlot: (currentSlot: number) => void,
  postEpochs: (args: {
    currentEpoch: Epoch | undefined;
    nextEpoch: Epoch | undefined;
  }) => void,
  postSkippedClusterSlots: (skippedClusterSlots: Set<number>) => void,
) {
  let epochs: Epoch[] = [];
  let currentEpoch: Epoch | undefined;
  let nextEpoch: Epoch | undefined;
  let currentSlot: number | undefined;
  let skippedClusterSlots = new Set<number>();

  function findCurrentEpoch() {
    const slot = currentSlot;
    if (!epochs.length || slot === undefined) return;

    const epoch = epochs.find(
      ({ start_slot, end_slot }) => slot >= start_slot && slot <= end_slot,
    );
    if (!epoch) return;

    return epoch;
  }

  function findNextEpoch(currentEpochNumber?: number) {
    if (currentEpochNumber == null) return;
    return epochs.find((epoch) => epoch.epoch === currentEpochNumber + 1);
  }

  function updateAndPostEpochs() {
    const newCurrentEpoch = findCurrentEpoch();
    const newCurrentEpochNumber = newCurrentEpoch?.epoch;

    const newNextEpoch = findNextEpoch(newCurrentEpochNumber);
    const changed =
      newCurrentEpoch !== currentEpoch || newNextEpoch !== nextEpoch;

    currentEpoch = newCurrentEpoch;
    nextEpoch = newNextEpoch;

    if (newCurrentEpochNumber != null) {
      // delete past epochs
      epochs = epochs.filter((epoch) => epoch.epoch >= newCurrentEpochNumber);
    }

    if (changed) {
      postEpochs({ currentEpoch, nextEpoch });
      onEpochChange();
    }
  }

  function onEpochChange() {
    if (currentEpoch) {
      deleteSkippedClusterSlotsOutsideEpoch(currentEpoch);
    }
  }

  function deleteSkippedClusterSlotsOutsideEpoch(epoch: Epoch) {
    const toKeep = new Set<number>();

    for (const slot of skippedClusterSlots) {
      // not in epoch
      if (slot < epoch.start_slot || slot > epoch.end_slot) continue;
      toKeep.add(slot);
    }

    const changed = toKeep.size !== skippedClusterSlots.size;
    skippedClusterSlots = toKeep;

    if (changed) {
      postSkippedClusterSlots(skippedClusterSlots);
    }
  }

  return {
    setCurrentSlot(slot: number) {
      const newCurrentSlot = Math.max(slot, currentSlot ?? 0);
      const changed = newCurrentSlot !== currentSlot;
      currentSlot = newCurrentSlot;

      if (changed) {
        postCurrentSlot(currentSlot);
        updateAndPostEpochs();
      }
    },

    addEpoch(epoch: Epoch) {
      const isDuplicate =
        epochs.findIndex((e) => e.epoch === epoch.epoch) !== -1;
      if (isDuplicate) return;

      epochs.push(epoch);
      updateAndPostEpochs();
    },

    addSkippedClusterSlots(slots: number[]) {
      const initialSize = skippedClusterSlots.size;
      for (const slot of slots) {
        skippedClusterSlots.add(slot);
      }
      if (initialSize !== skippedClusterSlots.size) {
        postSkippedClusterSlots(skippedClusterSlots);
      }
    },
    deleteSkippedClusterSlot(slot: number) {
      const initialSize = skippedClusterSlots.size;
      skippedClusterSlots.delete(slot);
      if (initialSize !== skippedClusterSlots.size) {
        postSkippedClusterSlots(skippedClusterSlots);
      }
    },
  };
}
