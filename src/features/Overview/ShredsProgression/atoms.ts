import { atom } from "jotai";
import type { LiveShreds } from "../../../api/types";
import { ShredEvent } from "../../../api/entities";
import { delayMs, xRangeMs } from "./const";
import { firstTurbineSlotAtom } from "../../StartupProgress/Firedancer/CatchingUp/atoms";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import { nsPerMs } from "../../../consts";

type ShredEventTsDeltaMs = number | undefined;
/**
 * Array of <event ts delta in ms>.
 * Array index, i corresponds to the shred event type.
 * The ts delta is relative to the referenceTs.
 */
export type ShredEventTsDeltas = ShredEventTsDeltaMs[];

type Slot = {
  shreds: (ShredEventTsDeltas | undefined)[];
  minEventTsDelta?: number;
  completionTsDelta?: number;
};

export type SlotsShreds = {
  referenceTs: number;
  slots: {
    [slotNumber: number]: Slot;
  };
};

/**
 * Store live shreds
 * Use reference / delta slot number and timestamp to minimize memory usage
 */
export function createLiveShredsAtoms() {
  const _liveShredsAtom = atom<SlotsShreds>();
  const _slotRangeAtom = atom<{
    min: number;
    max: number;
  }>();
  return {
    range: atom((get) => get(_slotRangeAtom)),
    slotsShreds: atom((get) => get(_liveShredsAtom)),
    addShredEvents: atom(
      null,
      (
        get,
        set,
        {
          reference_slot,
          reference_ts,
          slot_delta,
          shred_idx,
          event,
          event_ts_delta,
        }: LiveShreds,
      ) => {
        let slotRange = get(_slotRangeAtom);

        set(_liveShredsAtom, (prev) => {
          const updated: SlotsShreds = prev ?? {
            referenceTs: Math.round(Number(reference_ts) / nsPerMs),
            slots: {},
          };

          for (let i = 0; i < event.length; i++) {
            const ev = event[i];
            if (slot_delta[i] == null || event_ts_delta[i] == null) {
              console.error(`invalid shred data arrays, missing index ${i}`);
              break;
            }

            const slotNumber = reference_slot + slot_delta[i];
            const shredIdx = shred_idx[i];

            // convert to current reference and delta
            const eventTsDelta = Math.round(
              (Number(reference_ts) + event_ts_delta[i]) / nsPerMs -
                updated.referenceTs,
            );

            // add event to slot shred
            updated.slots[slotNumber] = addEventToSlot(
              shredIdx,
              ev,
              eventTsDelta,
              updated.slots[slotNumber],
            );

            // update range
            slotRange = {
              min: Math.min(slotNumber, slotRange?.min ?? slotNumber),
              max: Math.max(slotNumber, slotRange?.max ?? slotNumber),
            };
          }

          return updated;
        });

        set(_slotRangeAtom, slotRange);
      },
    ),

    deleteSlots:
      /**
       * Delete slots that completed before the chart x-axis starting time.
       * Update the min slot
       */
      atom(null, (get, set, shouldDeleteAll: boolean) => {
        if (shouldDeleteAll) {
          set(_slotRangeAtom, undefined);
          set(_liveShredsAtom, undefined);
          return;
        }

        set(_liveShredsAtom, (prev) => {
          const slotRange = get(_slotRangeAtom);

          if (!prev || !slotRange) return;

          let minSlot = slotRange.min;
          if (slotRange.max - slotRange.min > 50) {
            // only keep 50 slots
            for (
              let slotNumber = minSlot;
              slotNumber <= slotRange.max - 50;
              slotNumber++
            ) {
              const slot = prev.slots[slotNumber];
              if (!slot) continue;

              delete prev.slots[slotNumber];
            }

            minSlot = slotRange.max - 50;
          }
          // delete slots outside visible x range
          const nowDelta = new Date().getTime() - prev.referenceTs;
          const chartXRange = xRangeMs + delayMs;

          let shouldDeleteSlot = false;
          for (
            let slotNumber = minSlot;
            slotNumber >= slotRange.min;
            slotNumber--
          ) {
            const slot = prev.slots[slotNumber];
            if (!slot) continue;

            if (
              !shouldDeleteSlot &&
              slot.completionTsDelta != null &&
              nowDelta - slot.completionTsDelta > chartXRange
            ) {
              // once we find a slot that is complete and far enough in the past, delete all slot numbers less it
              shouldDeleteSlot = true;
            }

            if (shouldDeleteSlot) {
              delete prev.slots[slotNumber];
            }
          }

          // update range to reflect remaining slots
          const remainingSlotNumbers = Object.keys(prev.slots).map(
            (slotNumber) => parseInt(slotNumber),
          );
          set(_slotRangeAtom, (prevRange) => {
            if (!prevRange || !remainingSlotNumbers.length) {
              return;
            }
            prevRange.min = Math.min(...remainingSlotNumbers);
            return prevRange;
          });

          return prev;
        });
      }),
  };
}

const beforeFirstTurbineShredsAtoms = createLiveShredsAtoms();
const fromFirstTurbineShredsAtoms = createLiveShredsAtoms();

export const addLiveShredsAtom = atom(
  null,
  (
    get,
    set,
    {
      reference_slot,
      reference_ts,
      slot_delta,
      shred_idx,
      event,
      event_ts_delta,
    }: LiveShreds,
  ) => {
    const firstTurbineSlot = get(firstTurbineSlotAtom);
    if (firstTurbineSlot == null) return;

    const beforeFirstTurbineLiveShreds: LiveShreds = {
      reference_slot,
      reference_ts,
      slot_delta: [],
      shred_idx: [],
      event: [],
      event_ts_delta: [],
    };

    const fromFirstTurbineLiveShreds: LiveShreds = {
      reference_slot,
      reference_ts,
      slot_delta: [],
      shred_idx: [],
      event: [],
      event_ts_delta: [],
    };

    for (let i = 0; i < event.length; i++) {
      const slotNumber = reference_slot + slot_delta[i];
      const group =
        slotNumber < firstTurbineSlot
          ? beforeFirstTurbineLiveShreds
          : fromFirstTurbineLiveShreds;

      group.slot_delta.push(slot_delta[i]);
      group.shred_idx.push(shred_idx[i]);
      group.event.push(event[i]);
      group.event_ts_delta.push(event_ts_delta[i]);
    }

    set(
      beforeFirstTurbineShredsAtoms.addShredEvents,
      beforeFirstTurbineLiveShreds,
    );

    set(fromFirstTurbineShredsAtoms.addShredEvents, fromFirstTurbineLiveShreds);
  },
);

export const deleteLiveShredsAtom = atom(null, (get, set) => {
  const shouldDeleteAll = get(socketStateAtom) === SocketState.Disconnected;
  set(beforeFirstTurbineShredsAtoms.deleteSlots, shouldDeleteAll);
  set(fromFirstTurbineShredsAtoms.deleteSlots, shouldDeleteAll);
});

export function getLiveShredsAtoms(drawOnlyBeforeFirstTurbine: boolean) {
  return drawOnlyBeforeFirstTurbine
    ? beforeFirstTurbineShredsAtoms
    : fromFirstTurbineShredsAtoms;
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
function addEventToSlot(
  shredIdx: number | null,
  event: ShredEvent,
  eventTsDelta: number,
  slotToMutate: Slot | undefined,
): Slot {
  const slot = slotToMutate ?? {
    shreds: [],
  };

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

  // update slot min event ts
  slot.minEventTsDelta = Math.min(
    eventTsDelta,
    slot.minEventTsDelta ?? eventTsDelta,
  );

  // update shred
  slot.shreds[shredIdx] = addEventToShred(
    event,
    eventTsDelta,
    slot.shreds[shredIdx],
  );

  return slot;
}
