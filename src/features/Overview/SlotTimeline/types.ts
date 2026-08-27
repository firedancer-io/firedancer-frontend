export type SlotLaneId =
  | "nextLeader"
  | "turbine"
  | "repair"
  | "replay"
  | "vote"
  | "confirmed"
  | "root"
  | "finalized"
  | "storage";

export interface SlotLane {
  id: SlotLaneId;
  label: string;
  /* null means the lane is known to have no slot rather than not yet
     known: an unstaked validator never leads, so its next leader lane
     stays visible and reads "never" instead of disappearing. */
  slot: number | null;
  color: string;
  isReference?: boolean;
}

export interface SlotTimelineValues {
  isAlpenglow: boolean;
  nextLeaderSlot?: number;
  turbineSlot?: number | null;
  repairSlot?: number | null;
  replaySlot: number;
  voteSlot?: number | null;
  optimisticallyConfirmedSlot?: number;
  rootSlot?: number;
  finalizedSlot?: number;
  storageSlot?: number | null;
}

export interface CurrentSlotRange {
  minSlot: number;
  maxSlot: number;
  slots: number[];
}
