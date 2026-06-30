import { atom } from "jotai";
import type { LiveShreds } from "../../../api/types";
import { ShredEvent } from "../../../api/entities";
import { delayMs, xRangeMs } from "../../../api/worker/cache/shreds/shredsCalc";
import { nsPerMs, slotsPerLeader } from "../../../consts";
import { getSlotGroupLeader } from "../../../utils";
import { serverTimeMsAtom, skippedClusterSlotsAtom } from "../../../atoms";
import { slotCaughtUpAtom } from "../../../api/atoms";
import { isWebGl2Available } from "./webglSupport";

type ShredEventTsDeltaMs = number | undefined;
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

export interface LiveShredsData {
  minCompletedSlot?: number;
  range?: { min: number; max: number };
  slotsShreds?: SlotsShreds;
}

/**
 * Store live shreds
 * Use reference / delta slot number and timestamp to minimize memory usage
 */
export function createLiveShredsAtoms() {
  const _minCompletedSlotAtom = atom<number>();
  const _liveShredsAtom = atom<SlotsShreds>();
  const _slotRangeAtom = atom<{
    min: number;
    max: number;
  }>();
  const rangeAfterStartupAtom = atom((get) => {
    const range = get(_slotRangeAtom);
    const slotCaughtUp = get(slotCaughtUpAtom);
    if (!range || slotCaughtUp == null) return;

    // no slots after startup
    if (slotCaughtUp + 1 > range.max) return;

    return {
      min: Math.max(slotCaughtUp + 1, range.min),
      max: range.max,
    };
  });
  return {
    /**
     * min completed slot we've seen since we started collecting data
     */
    minCompletedSlot: atom((get) => get(_minCompletedSlotAtom)),
    range: atom((get) => get(_slotRangeAtom)),
    rangeAfterStartup: rangeAfterStartupAtom,
    /**
     *  leader slots after startup, used for labels
     * */
    groupLeaderSlots: atom((get) => {
      const rangeAfterStartup = get(rangeAfterStartupAtom);
      if (!rangeAfterStartup) return [];

      const slots = [getSlotGroupLeader(rangeAfterStartup.min)];
      while (
        slots[slots.length - 1] + slotsPerLeader - 1 <
        rangeAfterStartup.max
      ) {
        slots.push(
          getSlotGroupLeader(slots[slots.length - 1] + slotsPerLeader),
        );
      }
      return slots;
    }),
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
        const minCompletedSlot = get(_minCompletedSlotAtom);
        let newMinCompletedSlot = minCompletedSlot;

        let minEventSlot = Infinity;

        set(_liveShredsAtom, (prev) => {
          const updated: SlotsShreds = prev ?? {
            referenceTs: Math.round(Number(reference_ts) / nsPerMs),
            slots: new Map(),
          };

          for (let i = 0; i < event.length; i++) {
            const ev = event[i];
            // unsupported event type
            if (!(ev in ShredEvent)) {
              console.debug(`received unsupported shred event type ${ev}`);
              continue;
            }

            if (slot_delta[i] == null || event_ts_delta[i] == null) {
              console.error(`invalid shred data arrays, missing index ${i}`);
              break;
            }

            const slotNumber = reference_slot + slot_delta[i];
            minEventSlot = Math.min(minEventSlot, slotNumber);

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

            if (ev === ShredEvent.slot_complete) {
              newMinCompletedSlot = Math.min(
                slotNumber,
                newMinCompletedSlot ?? slotNumber,
              );
            }

            // update range
            slotRange = {
              min: Math.min(slotNumber, slotRange?.min ?? slotNumber),
              max: Math.max(slotNumber, slotRange?.max ?? slotNumber),
            };
          }

          return updated;
        });

        set(_slotRangeAtom, slotRange);
        set(_minCompletedSlotAtom, newMinCompletedSlot);

        // mark slot for redraw
        set(setMinDirtySlotByChartIfSmaller, minEventSlot);
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
          set(_minCompletedSlotAtom, undefined);
          set(_liveShredsAtom, undefined);
          return;
        }

        set(_liveShredsAtom, (prev) => {
          const slotRange = get(_slotRangeAtom);
          const now = get(serverTimeMsAtom) ?? Date.now();

          if (!prev || !slotRange) return prev;

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
            const countToKeep = 50;
            if (slotRange.max - slotRange.min > countToKeep) {
              // only keep countToKeep slots
              for (
                let slotNumber = minSlot;
                slotNumber <= slotRange.max - countToKeep;
                slotNumber++
              ) {
                const slot = prev.slots.get(slotNumber);
                if (!slot) continue;
                prev.slots.delete(slotNumber);
              }

              minSlot = slotRange.max - countToKeep + 1;
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
                // once we find a slot that is complete and far enough in the past,
                // delete all slot numbers less it but keep this one for label spacing reference
                shouldDeleteSlot = true;
                continue;
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
            return {
              min: Math.min(...remainingSlotNumbers),
              max: prevRange.max,
            };
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
 * Live shreds data assembled from the main-thread atoms
 */
export const liveShredsDataAtom = atom<LiveShredsData>((get) => ({
  slotsShreds: get(shredsAtoms.slotsShreds),
  range: get(shredsAtoms.range),
  minCompletedSlot: get(shredsAtoms.minCompletedSlot),
}));

export const liveShredsPostStartupRangeAtom = atom((get) =>
  get(shredsAtoms.rangeAfterStartup),
);

/**
 * Whether WebGL2 is available.
 * Will be set to false if renderer setup fails at runtime
 * (e.g. because of context-limit / driver failure).
 */
export const isWebgl2SupportedAtom = atom(isWebGl2Available());

export const minDirtySlotByChartAtom = atom<Map<string, number>>(new Map());

/*
 * Maps chartId to the minimum slot number that received a shred update since the last draw.
 * Reset each entry to Infinity after the chart consumes it (do not delete, so new updates can accumulate).
 */
export const setMinDirtySlotByChartIfSmaller = atom(
  null,
  (_get, set, updatedSlot: number) => {
    set(minDirtySlotByChartAtom, (prev) => {
      for (const [chartId, minDirtySlot] of prev) {
        if (updatedSlot < minDirtySlot) {
          prev.set(chartId, updatedSlot);
        }
      }
      return prev;
    });
  },
);

/**
 * Mark a slot as dirty if skipped state changed
 */
export const setDirtySlotOnSkippedChangeAtom = atom(
  null,
  (get, set, slot: number, isSkipped: boolean) => {
    const wasSkipped = get(skippedClusterSlotsAtom).has(slot);
    if (wasSkipped === isSkipped) return;

    set(setMinDirtySlotByChartIfSmaller, slot);
  },
);

/**
 *  leader slots after startup, used for labels
 * */
export const liveShredsPostStartupLeaderSlotsAtom = atom((get) => {
  const rangeAfterStartup = get(liveShredsPostStartupRangeAtom);
  if (!rangeAfterStartup) return;

  return {
    min: getSlotGroupLeader(rangeAfterStartup.min),
    max: getSlotGroupLeader(rangeAfterStartup.max),
  };
});

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
