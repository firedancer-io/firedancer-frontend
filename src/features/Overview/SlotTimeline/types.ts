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
  slot: number;
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
