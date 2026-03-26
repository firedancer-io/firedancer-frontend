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

export const bootProgressPhaseStyles: {
  [phase in BootPhase]: {
    name: string;
    incompleteColor: string;
    inProgressBackground: string;
    completeColor: string;
    borderColor: string;
  };
} = {
  [BootPhaseEnum.joining_gossip]: {
    name: "Joining Gossip",
    incompleteColor: progressBarIncompleteGossipColor,
    inProgressBackground: progressBarInProgressGossipBackground,
    completeColor: progressBarCompleteGossipColor,
    borderColor: progressBarInProgressGossipBorder,
  },
  [BootPhaseEnum.loading_full_snapshot]: {
    name: "Loading Full Snapshot",
    incompleteColor: progressBarIncompleteFullSnapshotColor,
    inProgressBackground: progressBarInProgressFullSnapshotBackground,
    completeColor: progressBarCompleteFullSnapshotColor,
    borderColor: progressBarInProgressFullSnapshotBorder,
  },
  [BootPhaseEnum.loading_incremental_snapshot]: {
    name: "Loading Incremental Snapshot",
    incompleteColor: progressBarIncompleteIncSnapshotColor,
    inProgressBackground: progressBarInProgressIncSnapshotBackground,
    completeColor: progressBarCompleteIncSnapshotColor,
    borderColor: progressBarInProgressIncSnapshotBorder,
  },
  [BootPhaseEnum.catching_up]: {
    name: "Catching Up",
    incompleteColor: progressBarIncompleteCatchupColor,
    inProgressBackground: progressBarInProgressCatchupBackground,
    completeColor: progressBarCompleteCatchupColor,
    borderColor: progressBarInProgressCatchupBorder,
  },
  [BootPhaseEnum.running]: {
    name: "Running",
    incompleteColor: "",
    inProgressBackground: "",
    completeColor: "",
    borderColor: "transparent",
  },
};
