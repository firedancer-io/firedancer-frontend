import { atom, useAtomValue } from "jotai";
import {
  completedSlotAtom,
  finalizedSlotAtom,
  isAlpenglowAtom,
  notarizedSlotAtom,
  optimisticallyConfirmedSlotAtom,
  repairSlotAtom,
  rootSlotAtom,
  storageSlotAtom,
  turbineSlotAtom,
  voteSlotAtom,
} from "../../../api/atoms";
import { nextEpochLeaderSlotAtom, nextLeaderSlotAtom } from "../../../atoms";
import type { SlotLaneInfo } from "./types";
import styles from "./slotLanes.module.css";
import { getSlotLaneInfo } from "./utils";
import { useRef } from "react";

const shrinkCountIntervalMs = 2_000;
const shrinkCountDivisor = 2;

const nonAlpenglowSlotLanesAtom = atom((get) => {
  const storageSlot = get(storageSlotAtom);
  const rootSlot = get(rootSlotAtom);
  const voteSlot = get(voteSlotAtom);
  const repairSlot = get(repairSlotAtom);
  const turbineSlot = get(turbineSlotAtom);
  const replaySlot = get(completedSlotAtom);
  const optimisticallyConfirmedSlot = get(optimisticallyConfirmedSlotAtom);
  const nextLeaderSlot =
    get(nextLeaderSlotAtom) ?? get(nextEpochLeaderSlotAtom);

  const storageSlotLane = getSlotLaneInfo({
    label: "Storage",
    dtSlot: storageSlot,
    referenceSlot: replaySlot,
    className: styles.storage,
  });
  const rootSlotLane = getSlotLaneInfo({
    label: "Root",
    dtSlot: rootSlot,
    referenceSlot: replaySlot,
    className: styles.root,
  });
  const voteSlotLane = getSlotLaneInfo({
    label: "Voted",
    dtSlot: voteSlot,
    referenceSlot: replaySlot,
    className: styles.vote,
  });
  const repairSlotLane = getSlotLaneInfo({
    label: "Repair",
    dtSlot: repairSlot,
    referenceSlot: replaySlot,
    className: styles.repair,
  });
  const turbineSlotLane = getSlotLaneInfo({
    label: "Turbine",
    dtSlot: turbineSlot,
    referenceSlot: replaySlot,
    className: styles.turbine,
  });
  const replaySlotLane = getSlotLaneInfo({
    label: "Processed",
    dtSlot: replaySlot,
    referenceSlot: replaySlot,
    className: styles.replay,
    isPinned: true,
  });
  const optimisticallyConfirmedLane = getSlotLaneInfo({
    label: "Confirmed",
    dtSlot: optimisticallyConfirmedSlot,
    referenceSlot: replaySlot,
    className: styles.confirmed,
  });
  const nextLeaderInfo = getSlotLaneInfo({
    label: "My Next Leader",
    dtSlot: nextLeaderSlot,
    referenceSlot: replaySlot,
  });

  const lanes = [
    turbineSlotLane,
    repairSlotLane,
    replaySlotLane,
    optimisticallyConfirmedLane,
    voteSlotLane,
    rootSlotLane,
    storageSlotLane,
  ];
  const slotRange = getSlotRange(lanes);

  return {
    lanes,
    slotRange,
    nextLeaderInfo,
  };
});

const alpenglowSlotLanesAtom = atom((get) => {
  const storageSlot = get(storageSlotAtom);
  const finalizedSlot = get(finalizedSlotAtom);
  const voteSlot = get(voteSlotAtom);
  const repairSlot = get(repairSlotAtom);
  const turbineSlot = get(turbineSlotAtom);
  const replaySlot = get(completedSlotAtom);
  const notarizedSlot = get(notarizedSlotAtom);
  const nextLeaderSlot =
    get(nextLeaderSlotAtom) ?? get(nextEpochLeaderSlotAtom);

  const storageSlotLane = getSlotLaneInfo({
    label: "Storage",
    dtSlot: storageSlot,
    referenceSlot: replaySlot,
    className: styles.storage,
  });
  const finalizedSlotLane = getSlotLaneInfo({
    label: "Finalized",
    dtSlot: finalizedSlot,
    referenceSlot: replaySlot,
    className: styles.finalized,
  });
  const voteSlotLane = getSlotLaneInfo({
    label: "Voted",
    dtSlot: voteSlot,
    referenceSlot: replaySlot,
    className: styles.vote,
  });
  const repairSlotLane = getSlotLaneInfo({
    label: "Repair",
    dtSlot: repairSlot,
    referenceSlot: replaySlot,
    className: styles.repair,
  });
  const turbineSlotLane = getSlotLaneInfo({
    label: "Turbine",
    dtSlot: turbineSlot,
    referenceSlot: replaySlot,
    className: styles.turbine,
  });
  const replayedSlotLane = getSlotLaneInfo({
    label: "Replayed",
    dtSlot: replaySlot,
    referenceSlot: replaySlot,
    className: styles.replay,
    isPinned: true,
  });
  const notarizedSlotLane = getSlotLaneInfo({
    label: "Notarized",
    dtSlot: notarizedSlot,
    referenceSlot: replaySlot,
    className: styles.notarized,
  });
  const nextLeaderInfo = getSlotLaneInfo({
    label: "My Next Leader",
    dtSlot: nextLeaderSlot,
    referenceSlot: replaySlot,
  });

  const lanes = [
    turbineSlotLane,
    repairSlotLane,
    replayedSlotLane,
    notarizedSlotLane,
    voteSlotLane,
    finalizedSlotLane,
    storageSlotLane,
  ];
  const slotRange = getSlotRange(lanes);

  return {
    lanes,
    slotRange,
    nextLeaderInfo,
  };
});

export function getSlotRange(lanes: SlotLaneInfo[]) {
  const slots = lanes.map(({ slot }) => slot).filter((slot) => slot != null);
  if (!slots.length) return undefined;

  return {
    maxSlot: Math.max(...slots),
    minSlot: Math.min(...slots),
  };
}

export function useSlotLanes() {
  const prevSlotsCountRef = useRef(0);
  const lastCountUpdateTsRef = useRef(-Infinity);
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const lanesInfo = useAtomValue(
    isAlpenglow ? alpenglowSlotLanesAtom : nonAlpenglowSlotLanesAtom,
  );

  if (!lanesInfo.slotRange) {
    return lanesInfo;
  }

  const slotsCount =
    lanesInfo.slotRange.maxSlot - lanesInfo.slotRange.minSlot + 1;
  if (slotsCount === prevSlotsCountRef.current) {
    return lanesInfo;
  }

  const now = performance.now();

  // immediately grow range
  if (slotsCount > prevSlotsCountRef.current) {
    prevSlotsCountRef.current = slotsCount;
    lastCountUpdateTsRef.current = now;
    return lanesInfo;
  }

  // don't shrink range until interval
  if (now - lastCountUpdateTsRef.current < shrinkCountIntervalMs) {
    return {
      ...lanesInfo,
      slotRange: {
        maxSlot: lanesInfo.slotRange.maxSlot,
        minSlot:
          lanesInfo.slotRange.maxSlot -
          Math.round(prevSlotsCountRef.current) +
          1,
      },
    };
  }

  // shrink range gradually
  const diff = prevSlotsCountRef.current - slotsCount;
  const shrinkAmount = diff / shrinkCountDivisor;
  prevSlotsCountRef.current -= shrinkAmount;
  lastCountUpdateTsRef.current = now;
  return {
    ...lanesInfo,
    slotRange: {
      maxSlot: lanesInfo.slotRange.maxSlot,
      minSlot:
        lanesInfo.slotRange.maxSlot - Math.round(prevSlotsCountRef.current) + 1,
    },
  };
}
