import { ShredEvent } from "../../../entityEnums";

export type ShredEventTsDeltaMs = number | undefined;
/**
 * Array of <event ts delta in ms>.
 * Array index, i corresponds to the shred event type.
 * The ts delta is relative to the referenceTs.
 */
export type ShredEventTsDeltas = ShredEventTsDeltaMs[];

/** Row width of the flat event layout: one column per ShredEvent value */
export const SHRED_ROW_STRIDE =
  1 +
  Math.max(
    ...Object.values(ShredEvent).filter(
      (v): v is number => typeof v === "number",
    ),
  );

interface SlotTimes {
  /**
   * earliest event (start) of the slot
   */
  minEventTsDelta?: number;
  maxEventTsDelta?: number;
  completionTsDelta?: number;
}

/** Main-thread atoms shape: one JS array per shred row */
export interface JsonSlot extends SlotTimes {
  shreds: (ShredEventTsDeltas | undefined)[];
  evts?: never;
  shredCount?: never;
}

/**
 * Worker cache shape: rows flattened into one Float64Array per slot,
 * evts[shredIdx * SHRED_ROW_STRIDE + event] = ts delta, NaN = no event.
 * Transferable to the chart worker without a structured-clone walk.
 */
export interface FlatSlot extends SlotTimes {
  evts: Float64Array | null;
  shredCount: number;
  shreds?: never;
}

export type Slot = JsonSlot | FlatSlot;

export type SlotsShreds<S extends Slot = Slot> = {
  referenceTs: number;
  // slot number to Slot
  slots: Map<number, S>;
};

/** Read-only view for draw/label code shared by both row layouts */
export type SlotsShredsView = {
  referenceTs: number;
  slots: ReadonlyMap<number, Slot>;
};

/**
 * Store live shreds
 * Use reference / delta slot number and timestamp to minimize memory usage
 */
export interface LiveShredsData<S extends Slot = Slot> {
  /**
   * min completed slot we've seen since we started collecting data
   */
  minCompletedSlot?: number;
  range?: {
    min: number;
    max: number;
  };
  slotsShreds?: SlotsShreds<S>;
}
