import { BootPhaseEnum } from "../../../api/entities";
import type { BootPhase } from "../../../api/types";
import {
  progressBarIncompleteGossipColor,
  progressBarInProgressGossipBackground,
  progressBarCompleteGossipColor,
  progressBarIncompleteFullSnapshotColor,
  progressBarInProgressFullSnapshotBackground,
  progressBarCompleteFullSnapshotColor,
  progressBarIncompleteIncSnapshotColor,
  progressBarInProgressIncSnapshotBackground,
  progressBarCompleteIncSnapshotColor,
  progressBarIncompleteCatchupColor,
  progressBarInProgressCatchupBackground,
  progressBarCompleteCatchupColor,
  progressBarInProgressCatchupBorder,
  progressBarInProgressFullSnapshotBorder,
  progressBarInProgressGossipBorder,
  progressBarInProgressIncSnapshotBorder,
} from "../../../colors";

interface PhaseInfo {
  name: string;
  incompleteColor: string;
  inProgressBackground: string;
  completeColor: string;
  estimatedPct: number;
  borderColor: string;
}

const phases: {
  [phase in BootPhase]: PhaseInfo;
} = {
  [BootPhaseEnum.joining_gossip]: {
    name: "Joining Gossip ...",
    incompleteColor: progressBarIncompleteGossipColor,
    inProgressBackground: progressBarInProgressGossipBackground,
    completeColor: progressBarCompleteGossipColor,
    estimatedPct: 0.1,
    borderColor: progressBarInProgressGossipBorder,
  },
  [BootPhaseEnum.loading_full_snapshot]: {
    name: "Loading Full Snapshot ...",
    incompleteColor: progressBarIncompleteFullSnapshotColor,
    inProgressBackground: progressBarInProgressFullSnapshotBackground,
    completeColor: progressBarCompleteFullSnapshotColor,
    estimatedPct: 0.6,
    borderColor: progressBarInProgressFullSnapshotBorder,
  },
  [BootPhaseEnum.loading_incremental_snapshot]: {
    name: "Loading Incremental Snapshot ...",
    incompleteColor: progressBarIncompleteIncSnapshotColor,
    inProgressBackground: progressBarInProgressIncSnapshotBackground,
    completeColor: progressBarCompleteIncSnapshotColor,
    estimatedPct: 0.05,
    borderColor: progressBarInProgressIncSnapshotBorder,
  },
  [BootPhaseEnum.catching_up]: {
    name: "Catching Up ...",
    incompleteColor: progressBarIncompleteCatchupColor,
    inProgressBackground: progressBarInProgressCatchupBackground,
    completeColor: progressBarCompleteCatchupColor,
    estimatedPct: 0.25,
    borderColor: progressBarInProgressCatchupBorder,
  },
  [BootPhaseEnum.running]: {
    name: "Running ...",
    incompleteColor: "",
    inProgressBackground: "",
    completeColor: "",
    estimatedPct: 0,
    borderColor: "transparent",
  },
};

interface Step extends PhaseInfo {
  index: number;
}

export const steps = Object.entries(phases).reduce(
  (acc, [key, value], i) => {
    acc[key as BootPhase] = {
      ...value,
      index: i,
    };
    return acc;
  },
  {} as {
    [phase in BootPhase]: Step;
  },
);
