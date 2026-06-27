export type ShredEventTsDeltaMs = number | undefined;
/**
 * Array of <event ts delta in ms>.
 * Array index, i corresponds to the shred event type.
 * The ts delta is relative to the referenceTs.
 */
export type ShredEventTsDeltas = ShredEventTsDeltaMs[];

export type Slot = {
  shreds: (ShredEventTsDeltas | undefined)[];
  /**
   * earliest event (start) of the slot
   */
  minEventTsDelta?: number;
  maxEventTsDelta?: number;
  completionTsDelta?: number;
};

export type SlotsShreds = {
  referenceTs: number;
  // slot number to Slot
  slots: Map<number, Slot>;
};

/**
 * Store live shreds
 * Use reference / delta slot number and timestamp to minimize memory usage
 */
export interface LiveShredsData {
  /**
   * min completed slot we've seen since we started collecting data
   */
  minCompletedSlot?: number;
  range?: {
    min: number;
    max: number;
  };
  slotsShreds?: SlotsShreds;
  /**
   * min slot number updated since the last publish, and the min shred idx changed within that slot
   */
  minChangedSlot?: { slot: number; idx: number };
}
