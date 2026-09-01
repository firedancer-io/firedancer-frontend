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
import { maxLeftSlotsCellsCount } from "./const";

const shrinkRangeIntervalMs = 2_000;
const shrinkRangeDivisor = 2;

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

  const storageSlotBar = getSlotLaneInfo({
    label: "Storage",
    dtSlot: storageSlot,
    referenceSlot: replaySlot,
    className: styles.storage,
  });
  const rootSlotBar = getSlotLaneInfo({
    label: "Root",
    dtSlot: rootSlot,
    referenceSlot: replaySlot,
    className: styles.root,
  });
  const voteSlotBar = getSlotLaneInfo({
    label: "Voted",
    dtSlot: voteSlot,
    referenceSlot: replaySlot,
    className: styles.vote,
  });
  const repairSlotBar = getSlotLaneInfo({
    label: "Repair",
    dtSlot: repairSlot,
    referenceSlot: replaySlot,
    className: styles.repair,
  });
  const turbineSlotBar = getSlotLaneInfo({
    label: "Turbine",
    dtSlot: turbineSlot,
    referenceSlot: replaySlot,
    className: styles.turbine,
  });
  const replaySlotBar = getSlotLaneInfo({
    label: "Processed",
    dtSlot: replaySlot,
    referenceSlot: replaySlot,
    className: styles.replay,
    isPinned: true,
  });
  const optimisticallyConfirmedBar = getSlotLaneInfo({
    label: "Confirmed",
    dtSlot: optimisticallyConfirmedSlot,
    referenceSlot: replaySlot,
    className: styles.confirmed,
  });
  const nextLeaderSlotBar = getSlotLaneInfo({
    label: "Next Leader",
    dtSlot: nextLeaderSlot,
    referenceSlot: replaySlot,
    className: styles.nextLeader,
    isNextLeader: true,
  });

  const leftLanes = [
    turbineSlotBar,
    repairSlotBar,
    replaySlotBar,
    optimisticallyConfirmedBar,
    voteSlotBar,
    rootSlotBar,
    storageSlotBar,
  ];

  const lanes = [nextLeaderSlotBar, ...leftLanes];
  const leftRange = getLeftRange(leftLanes);

  return {
    lanes,
    leftRange,
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
  const nextLeaderSlot = get(nextLeaderSlotAtom);

  const storageSlotBar = getSlotLaneInfo({
    label: "Storage",
    dtSlot: storageSlot,
    referenceSlot: replaySlot,
    className: styles.storage,
  });
  const finalizedSlotBar = getSlotLaneInfo({
    label: "Finalized",
    dtSlot: finalizedSlot,
    referenceSlot: replaySlot,
    className: styles.finalized,
  });
  const voteSlotBar = getSlotLaneInfo({
    label: "Voted",
    dtSlot: voteSlot,
    referenceSlot: replaySlot,
    className: styles.vote,
  });
  const repairSlotBar = getSlotLaneInfo({
    label: "Repair",
    dtSlot: repairSlot,
    referenceSlot: replaySlot,
    className: styles.repair,
  });
  const turbineSlotBar = getSlotLaneInfo({
    label: "Turbine",
    dtSlot: turbineSlot,
    referenceSlot: replaySlot,
    className: styles.turbine,
  });
  const replayedSlotBar = getSlotLaneInfo({
    label: "Replayed",
    dtSlot: replaySlot,
    referenceSlot: replaySlot,
    className: styles.replay,
    isPinned: true,
  });
  const notarizedSlotBar = getSlotLaneInfo({
    label: "Notarized",
    dtSlot: notarizedSlot,
    referenceSlot: replaySlot,
    className: styles.notarized,
  });
  const nextLeaderSlotBar = getSlotLaneInfo({
    label: "Next Leader",
    dtSlot: nextLeaderSlot,
    referenceSlot: replaySlot,
    className: styles.nextLeader,
    isNextLeader: true,
  });

  const leftLanes = [
    turbineSlotBar,
    repairSlotBar,
    replayedSlotBar,
    notarizedSlotBar,
    voteSlotBar,
    finalizedSlotBar,
    storageSlotBar,
  ];

  const lanes = [nextLeaderSlotBar, ...leftLanes];
  const leftRange = getLeftRange(leftLanes);

  return {
    lanes,
    leftRange,
  };
});

export function getLeftRange(lanes: SlotLaneInfo[]) {
  const slots = lanes.map(({ slot }) => slot).filter((slot) => slot != null);
  if (!slots.length) return undefined;

  const maxSlot = Math.max(...slots);
  return {
    maxSlot,
    minSlot: Math.max(Math.min(...slots), maxSlot - maxLeftSlotsCellsCount + 1),
  };
}

export function useSlotLanes() {
  const prevLeftRangeSizeRef = useRef(0);
  const lastRangeShiftTsRef = useRef(-Infinity);
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const lanesInfo = useAtomValue(
    isAlpenglow ? alpenglowSlotLanesAtom : nonAlpenglowSlotLanesAtom,
  );

  if (!lanesInfo.leftRange) {
    return lanesInfo;
  }

  const rangeSize =
    lanesInfo.leftRange.maxSlot - lanesInfo.leftRange.minSlot + 1;
  if (rangeSize === prevLeftRangeSizeRef.current) {
    return lanesInfo;
  }

  const now = performance.now();

  // immediately grow range
  if (rangeSize > prevLeftRangeSizeRef.current) {
    prevLeftRangeSizeRef.current = rangeSize;
    lastRangeShiftTsRef.current = now;
    return lanesInfo;
  }

  // don't shrink range until interval
  if (now - lastRangeShiftTsRef.current < shrinkRangeIntervalMs) {
    return {
      ...lanesInfo,
      leftRange: {
        maxSlot: lanesInfo.leftRange.maxSlot,
        minSlot:
          lanesInfo.leftRange.maxSlot -
          Math.round(prevLeftRangeSizeRef.current) +
          1,
      },
    };
  }

  // shrink range gradually
  const diff = prevLeftRangeSizeRef.current - rangeSize;
  const shrinkAmount = diff / shrinkRangeDivisor;
  prevLeftRangeSizeRef.current -= shrinkAmount;
  lastRangeShiftTsRef.current = now;
  return {
    ...lanesInfo,
    leftRange: {
      maxSlot: lanesInfo.leftRange.maxSlot,
      minSlot:
        lanesInfo.leftRange.maxSlot -
        Math.round(prevLeftRangeSizeRef.current) +
        1,
    },
  };
}
