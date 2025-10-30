import { expect, describe, it, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAtomValue, useSetAtom } from "jotai";
import { createLiveShredsAtoms } from "../atoms";
import { Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { ShredEvent } from "../../../../api/entities";
import { xRangeMs, delayMs } from "../const";
import { nsPerMs } from "../../../../consts";

const emptyStoreWrapper = ({ children }: PropsWithChildren) => (
  <Provider>{children}</Provider>
);

describe("live shreds atoms with reference ts and ts deltas", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds live shred events for single shred, replacing duplicates with min ts", () => {
    const atoms = createLiveShredsAtoms();

    const { result } = renderHook(
      () => {
        const slotsShreds = useAtomValue(atoms.slotsShreds);
        const range = useAtomValue(atoms.range);
        const addShredEvents = useSetAtom(atoms.addShredEvents);
        return { slotsShreds, range, addShredEvents };
      },
      { wrapper: emptyStoreWrapper },
    );

    // initial state
    expect(result.current.slotsShreds).toBeUndefined();
    expect(result.current.range).toBeUndefined();

    // add initial shreds
    act(() => {
      result.current.addShredEvents({
        reference_slot: 2000,
        reference_ts: 123_000_000n,
        slot_delta: [3, 3, 3, 3, 3, 3],
        shred_idx: [2, null, 2, 2, null, 2],
        event: [
          ShredEvent.shred_received_repair,
          ShredEvent.slot_complete,
          ShredEvent.shred_repair_request,
          ShredEvent.shred_repair_request,
          ShredEvent.slot_complete,
          ShredEvent.shred_replayed,
        ],
        event_ts_delta: [
          2_000_030, 4_123_456, 5_678_234, 8_000_000, 3_234_123, 7_345_456,
        ],
      });
    });

    expect(result.current.slotsShreds).toEqual({
      referenceTs: 123,
      slots: {
        2003: {
          minEventTsDelta: 2,
          completionTsDelta: 3,
          shreds: [undefined, undefined, [6, undefined, 2, 7]],
        },
      },
    });
    expect(result.current.range).toEqual({
      min: 2003,
      max: 2003,
    });

    act(() => {
      result.current.addShredEvents({
        reference_slot: 2002,
        reference_ts: 124_100_000n,
        slot_delta: [1, 0, 1],
        shred_idx: [2, 1, 2],
        event: [
          ShredEvent.shred_repair_request,
          ShredEvent.shred_received_turbine,
          ShredEvent.shred_replayed,
        ],
        event_ts_delta: [1_000_030, 5_123_345, 2_345_231],
      });
    });

    // uses inital reference ts
    // update shred events with min ts
    expect(result.current.slotsShreds).toEqual({
      referenceTs: 123,
      slots: {
        2002: {
          minEventTsDelta: 6,
          shreds: [undefined, [undefined, 6]],
        },
        2003: {
          minEventTsDelta: 2,
          completionTsDelta: 3,
          shreds: [undefined, undefined, [2, undefined, 2, 3]],
        },
      },
    });
    expect(result.current.range).toEqual({
      min: 2002,
      max: 2003,
    });
  });

  it("deletes slot numbers before max completed slot number that was completed after chart min X", () => {
    vi.useFakeTimers({
      toFake: ["Date"],
    });
    const chartRangeMs = xRangeMs + delayMs;
    const chartRangeNs = chartRangeMs / nsPerMs;
    const date = new Date(chartRangeMs);
    vi.setSystemTime(date);

    const atoms = createLiveShredsAtoms();

    const { result } = renderHook(
      () => {
        const slotsShreds = useAtomValue(atoms.slotsShreds);
        const range = useAtomValue(atoms.range);
        const addShredEvents = useSetAtom(atoms.addShredEvents);
        const deleteSlots = useSetAtom(atoms.deleteSlots);
        return { slotsShreds, range, addShredEvents, deleteSlots };
      },
      { wrapper: emptyStoreWrapper },
    );

    const events = [
      {
        slot: 0,
        ts: chartRangeNs - 1_000_000,
        e: ShredEvent.shred_repair_request,
      },
      {
        slot: 1,
        ts: chartRangeNs + 1_000_000,
        e: ShredEvent.slot_complete,
      },
      {
        slot: 2,
        // this will be deleted even if it has an event in chart range,
        // because a slot number larger than it is marked as completed and being deleted
        ts: chartRangeNs + 1_000_000,
        e: ShredEvent.shred_repair_request,
      },
      {
        // max slot number that is complete before chart min X
        // delete this and all slot numbers before it
        slot: 3,
        ts: chartRangeNs - 1_000_000,
        e: ShredEvent.slot_complete,
      },
      {
        slot: 4,
        // threshold of not being deleted
        ts: chartRangeNs,
        e: ShredEvent.slot_complete,
      },
      {
        slot: 6,
        ts: chartRangeNs + 2_000_000,
        e: ShredEvent.shred_repair_request,
      },
    ];

    // add initial shreds
    act(() => {
      result.current.addShredEvents({
        reference_slot: 0,
        reference_ts: 0n,
        slot_delta: Object.values(events).map((v) => v.slot),
        shred_idx: Object.values(events).map((v) => 0),
        event: Object.values(events).map((v) => v.e),
        event_ts_delta: Object.values(events).map((v) => v.ts),
      });
    });

    expect(result.current.slotsShreds).toEqual({
      referenceTs: 0,
      slots: {
        "0": { shreds: [[-1]], minEventTsDelta: -1 },
        "1": { shreds: [], completionTsDelta: 1 },
        "2": { shreds: [[1]], minEventTsDelta: 1 },
        "3": { shreds: [], completionTsDelta: -1 },
        "4": { shreds: [], completionTsDelta: 0 },
        "6": { shreds: [[2]], minEventTsDelta: 2 },
      },
    });
    expect(result.current.range).toEqual({
      min: 0,
      max: 6,
    });

    // delete old slots
    act(() => {
      result.current.deleteSlots(false);
    });

    expect(result.current.slotsShreds).toEqual({
      referenceTs: 0,
      slots: {
        "4": { shreds: [], completionTsDelta: 0 },
        "6": { shreds: [[2]], minEventTsDelta: 2 },
      },
    });
    expect(result.current.range).toEqual({
      min: 4,
      max: 6,
    });

    // delete all
    act(() => {
      result.current.deleteSlots(true);
    });

    expect(result.current.slotsShreds).toBeUndefined();
    expect(result.current.range).toBeUndefined();
  });
});
