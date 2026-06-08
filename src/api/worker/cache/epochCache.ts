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
) {
  let epochs: Epoch[] = [];
  let currentEpoch: Epoch | undefined;
  let nextEpoch: Epoch | undefined;
  let currentSlot: number | undefined;

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
  };
}
