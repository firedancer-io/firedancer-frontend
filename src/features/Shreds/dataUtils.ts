import { ShredEvent } from "../../api/entities";
import { nsPerMs } from "../../consts";
import type {
  ShredEventTsDeltaMs,
  ShredEventTsDeltas,
  Slot,
  SlotRange,
  SlotsShreds,
} from "./types";

export interface ShredEventArrays {
  reference_slot: number | null;
  reference_ts: bigint | null;
  slot_delta: (number | null)[];
  idx: (number | null)[];
  event: number[];
  event_ts_delta: (bigint | null)[];
}

/**
 * Update slotsToMutate by adding in the events.
 */
export function mergeShredEvents(
  {
    reference_slot,
    reference_ts,
    slot_delta,
    idx,
    event,
    event_ts_delta,
  }: ShredEventArrays,
  slotsToMutate: SlotsShreds,
): {
  minEventSlot: number;
  newMinCompletedSlot: number | undefined;
  slotRange: SlotRange | undefined;
  touchedSlotNumbers: Set<number>;
} {
  let minEventSlot = Infinity;
  let newMinCompletedSlot: number | undefined;
  let slotRange: SlotRange | undefined;
  const touchedSlotNumbers = new Set<number>();

  // a null reference means the tile carries no data -> nothing to add
  if (reference_slot == null || reference_ts == null) {
    return { minEventSlot, newMinCompletedSlot, slotRange, touchedSlotNumbers };
  }

  for (let i = 0; i < event.length; i++) {
    const ev = event[i];
    // unsupported event type
    if (!(ev in ShredEvent)) {
      console.debug(`received unsupported shred event type ${ev}`);
      continue;
    }

    const slotDelta = slot_delta[i];
    const eventTsDeltaNs = event_ts_delta[i];
    if (slotDelta == null || eventTsDeltaNs == null) {
      console.error(`invalid shred data arrays, missing index ${i}`);
      break;
    }

    const slotNumber = reference_slot + slotDelta;
    minEventSlot = Math.min(minEventSlot, slotNumber);
    touchedSlotNumbers.add(slotNumber);

    // rebase the event's absolute ns to an ms delta from updated.referenceTs
    const eventAbsNs = reference_ts + eventTsDeltaNs;
    const eventTsDelta =
      Number(eventAbsNs - slotsToMutate.referenceTs) / nsPerMs;

    slotsToMutate.slots.set(
      slotNumber,
      addEventToSlot(
        idx[i],
        ev,
        eventTsDelta,
        slotsToMutate.slots.get(slotNumber),
      ),
    );

    if (ev === ShredEvent.slot_complete) {
      newMinCompletedSlot = Math.min(
        slotNumber,
        newMinCompletedSlot ?? slotNumber,
      );
    }

    slotRange ??= { min: slotNumber, max: slotNumber };
    slotRange.min = Math.min(slotRange.min, slotNumber);
    slotRange.max = Math.max(slotRange.max, slotNumber);
  }

  return { minEventSlot, newMinCompletedSlot, slotRange, touchedSlotNumbers };
}

/**
 * Mutate shred by adding an event ts to event index
 */
function addEventToShred(
  event: Exclude<ShredEvent, ShredEvent.slot_complete>,
  eventTsDelta: number,
  shredToMutate: ShredEventTsDeltas | undefined,
): ShredEventTsDeltas {
  const shred = shredToMutate ?? new Array<ShredEventTsDeltaMs>();

  // in case of duplicate events, keep the min ts
  shred[event] = Math.min(eventTsDelta, shred[event] ?? eventTsDelta);

  return shred;
}

/**
 * Mutate slot by marking as complete, or adding an event to the shreds array
 */
export function addEventToSlot(
  shredIdx: number | null,
  event: ShredEvent,
  eventTsDelta: number,
  slotToMutate: Slot | undefined,
): Slot {
  const slot = slotToMutate ?? {
    shreds: [],
  };

  // update slot min event ts
  slot.minEventTsDelta = Math.min(
    eventTsDelta,
    slot.minEventTsDelta ?? eventTsDelta,
  );

  // update slot max event ts
  slot.maxEventTsDelta = Math.max(
    eventTsDelta,
    slot.maxEventTsDelta ?? eventTsDelta,
  );

  if (event === ShredEvent.slot_complete) {
    slot.completionTsDelta = Math.min(
      eventTsDelta,
      slot.completionTsDelta ?? eventTsDelta,
    );
    return slot;
  }

  if (shredIdx == null) {
    console.error("Missing shred ID");
    return slot;
  }

  // update shred
  slot.shreds[shredIdx] = addEventToShred(
    event,
    eventTsDelta,
    slot.shreds[shredIdx],
  );

  return slot;
}

export function isSlotComplete(slot: Slot | undefined): boolean {
  return slot?.completionTsDelta != null;
}
