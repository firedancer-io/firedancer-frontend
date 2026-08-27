import { nsPerMs } from "../../../../consts";
import { ShredEvent } from "../../../entityEnums";
import type { LiveShreds } from "../../../types";
import type { ValidatorState } from "../../types";
import type {
  FlatSlot,
  JsonSlot,
  LiveShredsData,
  ShredEventTsDeltas,
  SlotsShreds,
} from "./types";
import { SHRED_ROW_STRIDE } from "./types";

export const xRangeMs = 10_000;
export const delayMs = 50;
export const STARTUP_DELETE_INTERVAL_MS = 1_000;
export const POST_STARTUP_DELETE_INTERVAL_MS = xRangeMs / 4;

const INITIAL_ROWS = 128;

export function createShredsCalc(getValidatorState: () => ValidatorState) {
  let data: LiveShredsData<FlatSlot> = {};
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
    const updatedSlotsShreds: SlotsShreds<FlatSlot> = data.slotsShreds ?? {
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
      // TODO: adapt deletion range when using cache
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

  /** Replace state wholesale (offscreen chart worker snapshot handoff) */
  function seed(newData: LiveShredsData<FlatSlot>) {
    data = newData;
    if (deleteTimeoutId == null && data.slotsShreds) {
      setRecursiveDeleteTimeout();
    }
  }

  return {
    add,
    seed,
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
 * Mutate slot by marking as complete, or adding an event to the flat rows
 */
function addEventToSlot(
  shredIdx: number | null,
  event: ShredEvent,
  eventTsDelta: number,
  slotToMutate: FlatSlot | undefined,
): FlatSlot {
  const slot = slotToMutate ?? {
    evts: null,
    shredCount: 0,
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

  let evts = slot.evts;
  const needed = (shredIdx + 1) * SHRED_ROW_STRIDE;
  if (!evts || evts.length < needed) {
    let rows = evts ? evts.length / SHRED_ROW_STRIDE : INITIAL_ROWS;
    while (rows * SHRED_ROW_STRIDE < needed) rows *= 2;
    const grown = new Float64Array(rows * SHRED_ROW_STRIDE).fill(NaN);
    if (evts) grown.set(evts);
    slot.evts = evts = grown;
  }
  if (shredIdx + 1 > slot.shredCount) slot.shredCount = shredIdx + 1;

  // in case of duplicate events, keep the min ts (NaN = first write)
  const off = shredIdx * SHRED_ROW_STRIDE + event;
  const prev = evts[off];
  evts[off] = prev < eventTsDelta ? prev : eventTsDelta;

  return slot;
}

/**
 * Copy for postMessage: rows sliced to their live length, buffers
 * returned for the transfer list so the receiver adopts them uncopied
 */
export function snapshotShredsData(data: LiveShredsData<FlatSlot>): {
  data: LiveShredsData<FlatSlot>;
  transfer: ArrayBuffer[];
} {
  const slotsShreds = data.slotsShreds;
  if (!slotsShreds) return { data: { ...data }, transfer: [] };

  const transfer: ArrayBuffer[] = [];
  const slots = new Map<number, FlatSlot>();
  for (const [slotNumber, slot] of slotsShreds.slots) {
    const evts =
      slot.evts && slot.shredCount
        ? slot.evts.slice(0, slot.shredCount * SHRED_ROW_STRIDE)
        : null;
    if (evts) transfer.push(evts.buffer);
    slots.set(slotNumber, { ...slot, evts });
  }
  return {
    data: {
      ...data,
      slotsShreds: { referenceTs: slotsShreds.referenceTs, slots },
    },
    transfer,
  };
}

/** Main-thread atoms form, for the fallback-chart seed (shredsSeed) */
export function shredsDataToJson(
  data: LiveShredsData<FlatSlot>,
): LiveShredsData<JsonSlot> {
  const slotsShreds = data.slotsShreds;
  if (!slotsShreds) return { ...data, slotsShreds: undefined };

  const slots = new Map<number, JsonSlot>();
  for (const [slotNumber, slot] of slotsShreds.slots) {
    const shreds: (ShredEventTsDeltas | undefined)[] = [];
    const { evts, shredCount } = slot;
    if (evts) {
      for (let shredIdx = 0; shredIdx < shredCount; shredIdx++) {
        const base = shredIdx * SHRED_ROW_STRIDE;
        let row: ShredEventTsDeltas | undefined;
        for (let event = 0; event < SHRED_ROW_STRIDE; event++) {
          const tsDelta = evts[base + event];
          if (!Number.isNaN(tsDelta)) (row ??= [])[event] = tsDelta;
        }
        if (row) shreds[shredIdx] = row;
      }
    }
    const jsonSlot: JsonSlot = { shreds };
    if (slot.minEventTsDelta !== undefined)
      jsonSlot.minEventTsDelta = slot.minEventTsDelta;
    if (slot.maxEventTsDelta !== undefined)
      jsonSlot.maxEventTsDelta = slot.maxEventTsDelta;
    if (slot.completionTsDelta !== undefined)
      jsonSlot.completionTsDelta = slot.completionTsDelta;
    slots.set(slotNumber, jsonSlot);
  }
  return {
    ...data,
    slotsShreds: { referenceTs: slotsShreds.referenceTs, slots },
  };
}
