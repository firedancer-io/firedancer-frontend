import { expect, describe, it, afterEach, beforeEach, vi } from "vitest";
import { ShredEvent } from "../../../../entities";
import { createShredsCache } from "../shredsCache";
import { nsPerMs } from "../../../../../consts";
import { liveShredsKey } from "../../../types";
import {
  delayMs,
  POST_STARTUP_DELETE_INTERVAL_MS,
  STARTUP_DELETE_INTERVAL_MS,
  xRangeMs,
} from "../shredsCalc";

function getDefaultValidatorState() {
  return {
    isStartup: undefined,
    serverTimeNanos: undefined,
  };
}

describe("createShredsCache", () => {
  let liveShredsCache: ReturnType<typeof createShredsCache> | undefined;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout"],
    });
  });

  afterEach(() => {
    liveShredsCache?.resetDataAndUnsubscribe();
    liveShredsCache = undefined;
    vi.useRealTimers();
  });

  it("adds live shred events for single shred, replacing duplicates with min ts and ignoring unsupported event types", () => {
    liveShredsCache = createShredsCache(
      {
        publishIntervalMs: Infinity,
      },
      vi.fn(),
      getDefaultValidatorState,
    );

    // before subscribeAndAdd
    expect(liveShredsCache.get()).toBeUndefined();

    // add initial shreds
    liveShredsCache.subscribeAndAdd({
      reference_slot: 2000,
      reference_ts: 123_000_000n,
      slot_delta: [3, 3, 3, 3, 3, 3, 3],
      shred_idx: [2, null, 2, 2, null, 2, 1],
      event: [
        ShredEvent.shred_received_repair,
        ShredEvent.slot_complete,
        ShredEvent.shred_repair_request,
        ShredEvent.shred_repair_request,
        ShredEvent.slot_complete,
        ShredEvent.shred_replayed,
        99999, // unsupported event type
      ],
      event_ts_delta: [
        2_000_030, 4_123_456, 5_678_234, 8_000_000, 3_234_123, 7_345_456,
      ],
    });

    expect(liveShredsCache.get()).toEqual({
      minCompletedSlot: 2003,
      range: {
        min: 2003,
        max: 2003,
      },
      slotsShreds: {
        referenceTs: 123,
        slots: new Map([
          [
            2003,
            {
              minEventTsDelta: 2,
              maxEventTsDelta: 8,
              completionTsDelta: 3,
              shreds: [undefined, undefined, [6, undefined, 2, 7]],
            },
          ],
        ]),
      },
    });

    liveShredsCache.subscribeAndAdd({
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

    // uses inital reference ts
    // update shred events with min ts
    expect(liveShredsCache.get()).toEqual({
      minCompletedSlot: 2003,
      range: {
        min: 2002,
        max: 2003,
      },
      slotsShreds: {
        referenceTs: 123,
        slots: new Map([
          [
            2002,
            {
              minEventTsDelta: 6,
              maxEventTsDelta: 6,
              shreds: [undefined, [undefined, 6]],
            },
          ],
          [
            2003,
            {
              minEventTsDelta: 2,
              maxEventTsDelta: 8,
              completionTsDelta: 3,
              shreds: [undefined, undefined, [2, undefined, 2, 3]],
            },
          ],
        ]),
      },
    });
  });

  it("keeps track of min completed slot number when multiple slots are completed in one received ws message", () => {
    liveShredsCache = createShredsCache(
      { publishIntervalMs: Infinity },
      vi.fn(),
      getDefaultValidatorState,
    );

    // add initial shreds
    liveShredsCache.subscribeAndAdd({
      reference_slot: 2000,
      reference_ts: 123_000_000n,
      slot_delta: [3, 3, 4, 4],
      shred_idx: [2, null, 1, null],
      event: [
        ShredEvent.shred_received_turbine,
        ShredEvent.slot_complete,
        ShredEvent.shred_received_turbine,
        ShredEvent.slot_complete,
      ],
      event_ts_delta: [2_000_030, 4_123_456, 5_678_234, 8_000_000],
    });

    expect(liveShredsCache.get()).toEqual({
      minCompletedSlot: 2003,
      range: {
        min: 2003,
        max: 2004,
      },
      slotsShreds: {
        referenceTs: 123,
        slots: new Map([
          [
            2003,
            {
              minEventTsDelta: 2,
              maxEventTsDelta: 4,
              completionTsDelta: 4,
              shreds: [undefined, undefined, [undefined, 2]],
            },
          ],
          [
            2004,
            {
              minEventTsDelta: 6,
              maxEventTsDelta: 8,
              completionTsDelta: 8,
              shreds: [undefined, [undefined, 6]],
            },
          ],
        ]),
      },
    });

    liveShredsCache.subscribeAndAdd({
      reference_slot: 2002,
      reference_ts: 124_100_000n,
      slot_delta: [0, 0],
      shred_idx: [0, null],
      event: [ShredEvent.shred_received_turbine, ShredEvent.slot_complete],
      event_ts_delta: [1_000_030, 2_123_345],
    });

    expect(liveShredsCache.get()).toEqual({
      minCompletedSlot: 2002,
      range: {
        min: 2002,
        max: 2004,
      },
      slotsShreds: {
        referenceTs: 123,
        slots: new Map([
          [
            2002,
            {
              minEventTsDelta: 2,
              maxEventTsDelta: 3,
              completionTsDelta: 3,
              shreds: [[undefined, 2]],
            },
          ],
          [
            2003,
            {
              minEventTsDelta: 2,
              maxEventTsDelta: 4,
              completionTsDelta: 4,
              shreds: [undefined, undefined, [undefined, 2]],
            },
          ],
          [
            2004,
            {
              minEventTsDelta: 6,
              maxEventTsDelta: 8,
              completionTsDelta: 8,
              shreds: [undefined, [undefined, 6]],
            },
          ],
        ]),
      },
    });
  });

  describe("non-startup deletion", () => {
    const chartRangeMs = xRangeMs + delayMs;
    const events = [
      {
        slot: 0,
        ts: -nsPerMs,
        e: ShredEvent.shred_repair_request,
      },
      {
        slot: 1,
        ts: nsPerMs,
        e: ShredEvent.slot_complete,
      },
      {
        slot: 2,
        // this will be deleted even if it has an event in chart range,
        // because a slot number larger than it is marked as completed and before chart min x
        ts: nsPerMs,
        e: ShredEvent.shred_repair_request,
      },
      {
        // max slot number that is complete before chart min X
        // keep this and delete all slot numbers before it
        slot: 3,
        ts: -nsPerMs,
        e: ShredEvent.slot_complete,
      },
      {
        slot: 4,
        // threshold of not being deleted
        ts: 0,
        e: ShredEvent.slot_complete,
      },
      {
        slot: 6,
        ts: 2 * nsPerMs,
        e: ShredEvent.shred_repair_request,
      },
    ];

    const toAdd = {
      reference_slot: 0,
      reference_ts: 0n,
      slot_delta: events.map((v) => v.slot),
      shred_idx: events.map((v) => 0),
      event: events.map((v) => v.e),
      event_ts_delta: events.map((v) => v.ts),
    };

    const expectedInitial = {
      minCompletedSlot: 1,
      range: {
        min: 0,
        max: 6,
      },
      slotsShreds: {
        referenceTs: 0,
        slots: new Map([
          [0, { shreds: [[-1]], minEventTsDelta: -1, maxEventTsDelta: -1 }],
          [
            1,
            {
              shreds: [],
              minEventTsDelta: 1,
              maxEventTsDelta: 1,
              completionTsDelta: 1,
            },
          ],
          [2, { shreds: [[1]], minEventTsDelta: 1, maxEventTsDelta: 1 }],
          [
            3,
            {
              shreds: [],
              minEventTsDelta: -1,
              maxEventTsDelta: -1,
              completionTsDelta: -1,
            },
          ],
          [
            4,
            {
              shreds: [],
              minEventTsDelta: 0,
              maxEventTsDelta: 0,
              completionTsDelta: 0,
            },
          ],
          [
            6,
            {
              shreds: [[2]],
              minEventTsDelta: 2,
              maxEventTsDelta: 2,
            },
          ],
        ]),
      },
    };

    const expectedPostDelete = {
      minCompletedSlot: 1,
      range: {
        min: 3,
        max: 6,
      },
      slotsShreds: {
        referenceTs: 0,
        slots: new Map([
          [
            3,
            {
              shreds: [],
              minEventTsDelta: -1,
              maxEventTsDelta: -1,
              completionTsDelta: -1,
            },
          ],
          [
            4,
            {
              shreds: [],
              minEventTsDelta: 0,
              maxEventTsDelta: 0,
              completionTsDelta: 0,
            },
          ],
          [
            6,
            {
              shreds: [[2]],
              minEventTsDelta: 2,
              maxEventTsDelta: 2,
            },
          ],
        ]),
      },
    };

    it("without server timestamp: deletes slot numbers before max completed slot number that was completed before chart min X", () => {
      // simulate progression over delete interval
      const date = new Date(chartRangeMs - POST_STARTUP_DELETE_INTERVAL_MS);
      vi.setSystemTime(date);

      liveShredsCache = createShredsCache(
        { publishIntervalMs: Infinity },
        vi.fn(),
        () => ({
          isStartup: false,
          serverTimeNanos: undefined,
        }),
      );

      // add initial shreds
      liveShredsCache.subscribeAndAdd(toAdd);

      expect(liveShredsCache.get()).toEqual(expectedInitial);

      // advance time to trigger deletion of old slots
      vi.advanceTimersByTime(POST_STARTUP_DELETE_INTERVAL_MS);

      expect(liveShredsCache.get()).toEqual(expectedPostDelete);

      // delete all
      liveShredsCache.resetDataAndUnsubscribe();
      expect(liveShredsCache.get()).toEqual({});
    });

    it("with server timestamp: deletes slot numbers before max completed slot number that was completed before chart min X", () => {
      // simulate progression over delete interval
      vi.setSystemTime(0);

      liveShredsCache = createShredsCache(
        { publishIntervalMs: Infinity },
        vi.fn(),
        () => ({
          isStartup: false,
          serverTimeNanos: chartRangeMs * nsPerMs,
        }),
      );

      // add initial shreds
      liveShredsCache.subscribeAndAdd(toAdd);

      expect(liveShredsCache.get()).toEqual(expectedInitial);

      // advance time to trigger deletion of old slots
      vi.advanceTimersByTime(POST_STARTUP_DELETE_INTERVAL_MS);

      expect(liveShredsCache.get()).toEqual(expectedPostDelete);
    });
  });

  it("startup: deletes slots with events before chart x range", () => {
    const chartRangeMs = xRangeMs + delayMs;
    // simulate progression over delete interval
    const date = new Date(chartRangeMs - STARTUP_DELETE_INTERVAL_MS);
    vi.setSystemTime(date);

    const events = [
      {
        slot: 0,
        // deleted
        ts: -nsPerMs,
        e: ShredEvent.shred_repair_request,
      },
      {
        slot: 1,
        // not deleted
        ts: nsPerMs,
        e: ShredEvent.slot_complete,
      },
      {
        slot: 2,
        // not deleted
        ts: nsPerMs,
        e: ShredEvent.shred_repair_request,
      },
      {
        // deleted
        slot: 3,
        ts: -nsPerMs,
        e: ShredEvent.slot_complete,
      },
      {
        slot: 4,
        // threshold of not being deleted
        ts: 0,
        e: ShredEvent.slot_complete,
      },
    ];

    liveShredsCache = createShredsCache(
      { publishIntervalMs: Infinity },
      vi.fn(),
      () => ({
        isStartup: true,
        serverTimeNanos: undefined,
      }),
    );

    // add initial shreds
    liveShredsCache.subscribeAndAdd({
      reference_slot: 0,
      reference_ts: 0n,
      slot_delta: events.map((v) => v.slot),
      shred_idx: events.map((v) => 0),
      event: events.map((v) => v.e),
      event_ts_delta: events.map((v) => v.ts),
    });

    expect(liveShredsCache.get()).toEqual({
      minCompletedSlot: 1,
      range: {
        min: 0,
        max: 4,
      },
      slotsShreds: {
        referenceTs: 0,
        slots: new Map([
          [0, { shreds: [[-1]], minEventTsDelta: -1, maxEventTsDelta: -1 }],
          [
            1,
            {
              shreds: [],
              minEventTsDelta: 1,
              maxEventTsDelta: 1,
              completionTsDelta: 1,
            },
          ],
          [2, { shreds: [[1]], minEventTsDelta: 1, maxEventTsDelta: 1 }],
          [
            3,
            {
              shreds: [],
              minEventTsDelta: -1,
              maxEventTsDelta: -1,
              completionTsDelta: -1,
            },
          ],
          [
            4,
            {
              shreds: [],
              minEventTsDelta: 0,
              maxEventTsDelta: 0,
              completionTsDelta: 0,
            },
          ],
        ]),
      },
    });

    // advance time to trigger deletion of old slots
    vi.advanceTimersByTime(STARTUP_DELETE_INTERVAL_MS);

    expect(liveShredsCache.get()).toEqual({
      minCompletedSlot: 1,
      range: {
        min: 1,
        max: 4,
      },
      slotsShreds: {
        referenceTs: 0,
        slots: new Map([
          [
            1,
            {
              shreds: [],
              minEventTsDelta: 1,
              maxEventTsDelta: 1,
              completionTsDelta: 1,
            },
          ],
          [
            2,
            {
              shreds: [[1]],
              minEventTsDelta: 1,
              maxEventTsDelta: 1,
            },
          ],
          [
            4,
            {
              shreds: [],
              minEventTsDelta: 0,
              maxEventTsDelta: 0,
              completionTsDelta: 0,
            },
          ],
        ]),
      },
    });
  });

  it("resetDataAndUnsubscribe resets data and posts empty data", () => {
    const post = vi.fn();
    liveShredsCache = createShredsCache(
      { publishIntervalMs: Infinity },
      post,
      getDefaultValidatorState,
    );

    liveShredsCache.subscribeAndAdd({
      reference_slot: 1000,
      reference_ts: 0n,
      slot_delta: [0],
      shred_idx: [0],
      event: [ShredEvent.shred_received_turbine],
      event_ts_delta: [1_000_000],
    });
    expect(liveShredsCache.get()).not.toEqual({});

    liveShredsCache.resetDataAndUnsubscribe();

    expect(liveShredsCache.get()).toEqual({});
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith([{ key: liveShredsKey, data: {} }]);
  });
});
