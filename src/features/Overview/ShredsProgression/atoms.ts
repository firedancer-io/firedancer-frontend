import { atom } from "jotai";
import type { LiveShreds } from "../../../api/types";
import { maxShredEvent, ShredEvent } from "../../../api/entities";
import { delayMs, xRangeMs } from "./const";
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
            slots: new Map(),
          };

          for (let i = 0; i < event.length; i++) {
            const ev = event[i];
            // unsupported event type
            if (ev > maxShredEvent) continue;

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
            updated.slots.set(
              slotNumber,
              addEventToSlot(
                shredIdx,
                ev,
                eventTsDelta,
                updated.slots.get(slotNumber),
              ),
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
       * Delete slots that completed before the chart x-axis starting time, or with dots outside visible x range
       * Update the min slot
       */
      atom(null, (get, set, deleteAll: boolean, isStartup: boolean) => {
        if (deleteAll) {
          set(_slotRangeAtom, undefined);
          set(_liveShredsAtom, undefined);
          return;
        }

        set(_liveShredsAtom, (prev) => {
          const slotRange = get(_slotRangeAtom);

          if (!prev || !slotRange) return prev;

          const now = new Date().getTime();

          if (isStartup) {
            // During startup, we only show event dots, not spans. Delete slots without events in chart view
            for (
              let slotNumber = slotRange.min;
              slotNumber <= slotRange.max;
              slotNumber++
            ) {
              const slot = prev.slots.get(slotNumber);
              if (!slot) continue;
              if (
                slot.maxEventTsDelta == null ||
                isBeforeChartX(slot.maxEventTsDelta, now, prev.referenceTs)
              ) {
                prev.slots.delete(slotNumber);
              }
            }
          } else {
            // After startup complete
            let minSlot = slotRange.min;
            if (slotRange.max - slotRange.min > 50) {
              // only keep 50 slots
              for (
                let slotNumber = minSlot;
                slotNumber <= slotRange.max - 50;
                slotNumber++
              ) {
                const slot = prev.slots.get(slotNumber);
                if (!slot) continue;
                prev.slots.delete(slotNumber);
              }

              minSlot = slotRange.max - 50;
            }

            let shouldDeleteSlot = false;
            for (
              let slotNumber = slotRange.max;
              slotNumber >= minSlot;
              slotNumber--
            ) {
              const slot = prev.slots.get(slotNumber);
              if (slot?.maxEventTsDelta == null) continue;

              if (
                !shouldDeleteSlot &&
                slot.completionTsDelta != null &&
                isBeforeChartX(slot.completionTsDelta, now, prev.referenceTs)
              ) {
                // once we find a slot that is complete and far enough in the past, delete all slot numbers less it
                shouldDeleteSlot = true;
              }

              if (shouldDeleteSlot) {
                prev.slots.delete(slotNumber);
              }
            }
          }

          // update range to reflect remaining slots
          const remainingSlotNumbers = prev.slots.keys();
          set(_slotRangeAtom, (prevRange) => {
            if (!prevRange || !prev.slots.size) {
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

function isBeforeChartX(tsDelta: number, now: number, referenceTs: number) {
  const nowDelta = now - referenceTs;
  const chartXRange = xRangeMs + delayMs;
  return nowDelta - tsDelta > chartXRange;
}

export const shredsAtoms = createLiveShredsAtoms();

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
