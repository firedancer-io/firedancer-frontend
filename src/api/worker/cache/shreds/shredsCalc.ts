import { nsPerMs } from "../../../../consts";
import { ShredEvent } from "../../../entities";
import type { LiveShreds } from "../../../types";
import type { ValidatorState } from "../../types";
import type {
  LiveShredsData,
  ShredEventTsDeltaMs,
  ShredEventTsDeltas,
  Slot,
  SlotsShreds,
} from "./types";

export const xRangeMs = 10_000;
export const delayMs = 50;
export const STARTUP_DELETE_INTERVAL_MS = 1_000;
export const POST_STARTUP_DELETE_INTERVAL_MS = xRangeMs / 4;

export function createShredsCalc(getValidatorState: () => ValidatorState) {
  let data: LiveShredsData = {};
  let deleteTimeoutId: NodeJS.Timeout | undefined;

  function add({
    reference_slot,
    reference_ts,
    slot_delta,
    shred_idx,
    event,
    event_ts_delta,
  }: LiveShreds) {
    let newMinCompletedSlot = data.minCompletedSlot;
    let newRange = data.range;
    const updatedSlotsShreds: SlotsShreds = data.slotsShreds ?? {
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
      const shredIdx = shred_idx[i];

      // convert to current reference and delta
      const eventTsDelta = Math.round(
        (Number(reference_ts) + event_ts_delta[i]) / nsPerMs -
          updatedSlotsShreds.referenceTs,
      );

      // add event to slot shred
      updatedSlotsShreds.slots.set(
        slotNumber,
        addEventToSlot(
          shredIdx,
          ev,
          eventTsDelta,
          updatedSlotsShreds.slots.get(slotNumber),
        ),
      );

      if (ev === ShredEvent.slot_complete) {
        newMinCompletedSlot = Math.min(
          slotNumber,
          newMinCompletedSlot ?? slotNumber,
        );
      }

      // update range
      newRange = {
        min: Math.min(slotNumber, newRange?.min ?? slotNumber),
        max: Math.max(slotNumber, newRange?.max ?? slotNumber),
      };
    }

    data = {
      ...data,
      minCompletedSlot: newMinCompletedSlot,
      range: newRange,
      slotsShreds: updatedSlotsShreds,
    };

    if (deleteTimeoutId == null) {
      setRecursiveDeleteTimeout();
    }
  }

  function resetDataAndClearDeleteTimeout() {
    data = {};
    clearDeleteTimeout();
  }

  /**
   * Delete slots that completed before the chart x-axis starting time, or with dots outside visible x range
   * Update the min slot
   */
  function deleteSlots(isStartup: boolean, serverTimeNanos?: number) {
    const now =
      serverTimeNanos == null ? Date.now() : serverTimeNanos / nsPerMs;
    if (!data.slotsShreds || !data.range) return;

    if (isStartup) {
      // During startup, we only show event dots, not spans. Delete slots without events in chart view
      for (
        let slotNumber = data.range.min;
        slotNumber <= data.range.max;
        slotNumber++
      ) {
        const slot = data.slotsShreds.slots.get(slotNumber);
        if (!slot) continue;
        if (
          slot.maxEventTsDelta == null ||
          isBeforeChartX(
            slot.maxEventTsDelta,
            now,
            data.slotsShreds.referenceTs,
          )
        ) {
          data.slotsShreds.slots.delete(slotNumber);
        }
      }
    } else {
      // After startup complete
      let minSlot = data.range.min;
      if (data.range.max - data.range.min > 50) {
        // only keep 50 slots
        for (
          let slotNumber = minSlot;
          slotNumber <= data.range.max - 50;
          slotNumber++
        ) {
          const slot = data.slotsShreds.slots.get(slotNumber);
          if (!slot) continue;
          data.slotsShreds.slots.delete(slotNumber);
        }
        minSlot = data.range.max - 50 + 1;
      }

      let shouldDeleteSlot = false;
      for (
        let slotNumber = data.range.max;
        slotNumber >= minSlot;
        slotNumber--
      ) {
        if (shouldDeleteSlot) {
          data.slotsShreds.slots.delete(slotNumber);
          continue;
        }

        const slot = data.slotsShreds.slots.get(slotNumber);
        if (slot?.maxEventTsDelta == null) continue;

        if (
          slot.completionTsDelta != null &&
          isBeforeChartX(
            slot.completionTsDelta,
            now,
            data.slotsShreds.referenceTs,
          )
        ) {
          // once we find a slot that is complete and far enough in the past,
          // delete all slot numbers less it but keep this one for label spacing reference
          shouldDeleteSlot = true;
        }
      }
    }

    // update range to reflect remaining slots
    data.range =
      data.range && data.slotsShreds.slots.size
        ? {
            min: getMinimumSlot(data.slotsShreds.slots.keys()),
            max: data.range.max,
          }
        : undefined;
  }

  function getMinimumSlot(slotNumbers: IterableIterator<number>): number {
    let min = Infinity;
    for (const slotNumber of slotNumbers) {
      if (slotNumber < min) min = slotNumber;
    }
    return min;
  }

  function setRecursiveDeleteTimeout() {
    deleteTimeoutId = setTimeout(
      () => {
        try {
          const validatorState = getValidatorState();
          deleteSlots(
            !!validatorState.isStartup,
            validatorState.serverTimeNanos,
          );
        } catch (e) {
          console.error("shreds calc slot deletion failed", e);
        } finally {
          setRecursiveDeleteTimeout();
        }
      },
      getValidatorState().isStartup
        ? STARTUP_DELETE_INTERVAL_MS
        : POST_STARTUP_DELETE_INTERVAL_MS,
    );
  }

  function clearDeleteTimeout() {
    clearTimeout(deleteTimeoutId);
    deleteTimeoutId = undefined;
  }

  return {
    add,
    resetDataAndClearDeleteTimeout,
    get data() {
      return data;
    },
  };
}

export type ShredsCalc = ReturnType<typeof createShredsCalc>;

function isBeforeChartX(tsDelta: number, now: number, referenceTs: number) {
  const nowDelta = now - referenceTs;
  const chartXRange = xRangeMs + delayMs;
  return nowDelta - tsDelta > chartXRange;
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
