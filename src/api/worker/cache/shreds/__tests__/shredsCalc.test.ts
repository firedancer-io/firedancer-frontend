import { expect, describe, it, afterEach, beforeEach, vi } from "vitest";
import { ShredEvent } from "../../../../entityEnums";
import {
  createShredsCalc,
  shredsDataToJson,
  snapshotShredsData,
} from "../shredsCalc";
import { SHRED_ROW_STRIDE } from "../types";

function createCalc() {
  return createShredsCalc(() => ({
    isStartup: undefined,
    serverTimeNanos: undefined,
  }));
}

describe("flat shreds layout", () => {
  let calc: ReturnType<typeof createShredsCalc> | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
  });

  afterEach(() => {
    calc?.resetDataAndClearDeleteTimeout();
    calc = undefined;
    vi.useRealTimers();
  });

  it("stores rows as Float64Array with NaN holes and keeps min ts on duplicates", () => {
    calc = createCalc();
    calc.add({
      reference_slot: 100,
      reference_ts: 0n,
      slot_delta: [0, 0, 0],
      shred_idx: [2, 2, 0],
      event: [
        ShredEvent.shred_received_turbine,
        ShredEvent.shred_received_turbine,
        ShredEvent.shred_published,
      ],
      event_ts_delta: [5_000_000, 3_000_000, 7_000_000],
    });

    const slot = calc.data.slotsShreds?.slots.get(100);
    expect(slot).toBeDefined();
    expect(slot?.evts).toBeInstanceOf(Float64Array);
    expect(slot?.shredCount).toBe(3);

    const evts = slot!.evts!;
    // duplicate kept min
    expect(evts[2 * SHRED_ROW_STRIDE + ShredEvent.shred_received_turbine]).toBe(
      3,
    );
    expect(evts[0 * SHRED_ROW_STRIDE + ShredEvent.shred_published]).toBe(7);
    // untouched cells are NaN, including the whole row 1
    expect(evts[2 * SHRED_ROW_STRIDE + ShredEvent.shred_replayed]).toBeNaN();
    for (let e = 0; e < SHRED_ROW_STRIDE; e++) {
      expect(evts[1 * SHRED_ROW_STRIDE + e]).toBeNaN();
    }
  });

  it("grows row capacity past the initial allocation without losing values", () => {
    calc = createCalc();
    calc.add({
      reference_slot: 100,
      reference_ts: 0n,
      slot_delta: [0],
      shred_idx: [0],
      event: [ShredEvent.shred_received_turbine],
      event_ts_delta: [1_000_000],
    });
    calc.add({
      reference_slot: 100,
      reference_ts: 0n,
      slot_delta: [0],
      shred_idx: [1500],
      event: [ShredEvent.shred_replayed],
      event_ts_delta: [2_000_000],
    });

    const slot = calc.data.slotsShreds?.slots.get(100);
    expect(slot?.shredCount).toBe(1501);
    expect(slot!.evts!.length).toBeGreaterThanOrEqual(1501 * SHRED_ROW_STRIDE);
    expect(
      slot!.evts![0 * SHRED_ROW_STRIDE + ShredEvent.shred_received_turbine],
    ).toBe(1);
    expect(
      slot!.evts![1500 * SHRED_ROW_STRIDE + ShredEvent.shred_replayed],
    ).toBe(2);
  });

  it("snapshotShredsData slices rows to live length and detaches from the source", () => {
    calc = createCalc();
    calc.add({
      reference_slot: 100,
      reference_ts: 0n,
      slot_delta: [0, 1],
      shred_idx: [4, null],
      event: [ShredEvent.shred_received_turbine, ShredEvent.slot_complete],
      event_ts_delta: [1_000_000, 2_000_000],
    });

    const { data, transfer } = snapshotShredsData(calc.data);

    const snapSlot = data.slotsShreds?.slots.get(100);
    expect(snapSlot?.evts?.length).toBe(5 * SHRED_ROW_STRIDE);
    expect(transfer).toEqual([snapSlot?.evts?.buffer]);
    // completion-only slot carries no buffer
    expect(data.slotsShreds?.slots.get(101)?.evts).toBeNull();

    // source mutation must not leak into the snapshot
    calc.add({
      reference_slot: 100,
      reference_ts: 0n,
      slot_delta: [0],
      shred_idx: [4],
      event: [ShredEvent.shred_replayed],
      event_ts_delta: [500_000],
    });
    expect(
      snapSlot!.evts![4 * SHRED_ROW_STRIDE + ShredEvent.shred_replayed],
    ).toBeNaN();

    // snapshot round-trips through seed as-is
    const seeded = createCalc();
    seeded.seed(data);
    expect(shredsDataToJson(seeded.data)).toEqual({
      minCompletedSlot: 101,
      range: { min: 100, max: 101 },
      slotsShreds: {
        referenceTs: 0,
        slots: new Map([
          [
            100,
            {
              minEventTsDelta: 1,
              maxEventTsDelta: 1,
              shreds: [
                undefined,
                undefined,
                undefined,
                undefined,
                [undefined, 1],
              ],
            },
          ],
          [
            101,
            {
              minEventTsDelta: 2,
              maxEventTsDelta: 2,
              completionTsDelta: 2,
              shreds: [],
            },
          ],
        ]),
      },
    });
    seeded.resetDataAndClearDeleteTimeout();
  });

  it("snapshotShredsData of an empty cache transfers nothing", () => {
    calc = createCalc();
    expect(snapshotShredsData(calc.data)).toEqual({ data: {}, transfer: [] });
  });

  it("shredsDataToJson emits rows with the original hole/length shape", () => {
    calc = createCalc();
    calc.add({
      reference_slot: 100,
      reference_ts: 0n,
      slot_delta: [0, 0],
      shred_idx: [1, 1],
      event: [ShredEvent.shred_repair_request, ShredEvent.shred_published],
      event_ts_delta: [1_000_000, 3_000_000],
    });

    const json = shredsDataToJson(calc.data);
    const row = json.slotsShreds?.slots.get(100)?.shreds[1];
    // length = highest set event index + 1
    expect(row?.length).toBe(ShredEvent.shred_published + 1);
    expect(row?.[ShredEvent.shred_repair_request]).toBe(1);
    expect(row?.[ShredEvent.shred_published]).toBe(3);
    expect(row?.[ShredEvent.shred_replayed]).toBeUndefined();
  });
});
