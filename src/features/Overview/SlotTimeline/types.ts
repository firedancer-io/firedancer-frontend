export interface SlotLaneInfo {
  label: string;
  slot: number | null | undefined;
  slotDt: number | null | undefined;
  className: string;
  isPinned?: boolean;
  isNextLeader?: boolean;
}
