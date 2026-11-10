import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import type { AggSlots, SlotResponse } from "../../../api/types";
import { rootSlotAtom } from "../../../api/atoms";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import { setSlotResponseAtom } from "../../../atoms";
import { AGG_SLOTS_QUERY_KEY } from "../useSlotsQuery";
import useMiniMapQuery from "./useMiniMapQuery";

const wsSend = vi.fn();
let serverMessageHandler: ((message: unknown) => void) | undefined;
vi.mock("../../../api/ws/utils", () => ({
  useWebSocketSend: () => wsSend,
  useServerMessages: (handler: (message: unknown) => void) => {
    serverMessageHandler = handler;
  },
}));

const store = getDefaultStore();
const ROOT_SLOT = 1;

const sentRanges = () =>
  wsSend.mock.calls.map(([message]) => {
    const { params } = message as {
      params: { start_ns: string; end_ns: string };
    };
    return [BigInt(params.start_ns), BigInt(params.end_ns)];
  });

const deliverLatestResponse = () => {
  const lastCall = wsSend.mock.calls.at(-1);
  if (!lastCall) return;
  const { id } = lastCall[0] as { id: number };
  serverMessageHandler?.({
    type: "kv",
    topic: "timeline",
    key: AGG_SLOTS_QUERY_KEY,
    id,
    value: {} as AggSlots,
  });
};

beforeEach(() => {
  wsSend.mockClear();
  // socket must be connected or every request is queued for reconnect
  store.set(socketStateAtom, SocketState.Connected);
  // root slot establishes the stable-data boundary; put its completed time past
  // every world end so stableNs tracks the world end each iteration
  store.set(setSlotResponseAtom, {
    publish: { slot: ROOT_SLOT, completed_time_nanos: 10_000n },
  } as unknown as SlotResponse);
  store.set(rootSlotAtom, ROOT_SLOT);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  store.set(socketStateAtom, SocketState.Disconnected);
  store.set(rootSlotAtom, undefined);
  serverMessageHandler = undefined;
});

describe("useMiniMapQuery", () => {
  it("returns a stable query callback across renders", () => {
    const { result, rerender } = renderHook(() => useMiniMapQuery(() => {}));
    const query = result.current;
    rerender();
    expect(result.current).toBe(query);
  });

  it("fetches the new end, and nothing when the world end steps back", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMiniMapQuery(() => {}));
    const query = result.current;

    query([0n, 1_000n], "8s");
    vi.advanceTimersByTime(1_000);
    deliverLatestResponse();
    query([0n, 2_000n], "8s");
    vi.advanceTimersByTime(1_000);
    deliverLatestResponse();
    // the smoothed clock stepped back
    query([0n, 1_900n], "8s");
    vi.advanceTimersByTime(1_000);
    deliverLatestResponse();
    query([0n, 2_500n], "8s");
    vi.advanceTimersByTime(1_000);
    deliverLatestResponse();

    expect(sentRanges()).toEqual([
      [0n, 1_000n],
      [1_000n, 2_000n],
      [2_000n, 2_500n],
    ]);
    for (const [start, end] of sentRanges()) expect(end).toBeGreaterThan(start);
  });

  it("refetches the whole world when the world start changes", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMiniMapQuery(() => {}));
    const query = result.current;

    query([1_000n, 2_000n], "8s");
    deliverLatestResponse();
    vi.advanceTimersByTime(400);

    // world expands backwards at the same granularity
    query([0n, 2_500n], "8s");

    expect(sentRanges()).toEqual([
      [1_000n, 2_000n],
      [0n, 2_500n],
    ]);
  });

  it("replays a request cancelled in the throttle on reconnect", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMiniMapQuery(() => {}));
    const query = result.current;

    // leading dispatch, completes
    query([0n, 1_000n], "8s");
    deliverLatestResponse();
    vi.advanceTimersByTime(400); // close the throttle window

    // leading dispatch of a new window, completes
    query([0n, 2_000n], "8s");
    deliverLatestResponse();
    // second call within the same window: held in the trailing timer, never
    // reaches sendQuery's body (no nextReqRef, no pendingRef)
    query([0n, 3_000n], "8s");

    expect(sentRanges()).toEqual([
      [0n, 1_000n],
      [1_000n, 2_000n],
    ]);

    // disconnect cancels the throttle, dropping the trailing [0, 3_000] request
    store.set(socketStateAtom, SocketState.Disconnected);
    // reconnect must replay the dropped request
    store.set(socketStateAtom, SocketState.Connected);
    vi.advanceTimersByTime(400); // flush the replayed request through the throttle

    expect(sentRanges()).toEqual([
      [0n, 1_000n],
      [1_000n, 2_000n],
      [2_000n, 3_000n],
    ]);
  });

  it("drains the latest request, not an older queued one, when a query completes", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMiniMapQuery(() => {}));
    const query = result.current;

    // A: leading dispatch, left in flight
    query([0n, 1_000n], "8s");
    vi.advanceTimersByTime(400);
    // B: leading dispatch of a new window, queued behind A
    query([0n, 2_000n], "8s");
    // C: same window, held in the trailing timer
    query([0n, 3_000n], "8s");

    expect(sentRanges()).toEqual([[0n, 1_000n]]);

    // completing A must not replace C in the throttle with the older B
    deliverLatestResponse();
    vi.advanceTimersByTime(400);

    expect(sentRanges()).toEqual([
      [0n, 1_000n],
      [1_000n, 3_000n],
    ]);
  });

  it("replays a request made while disconnected on reconnect", () => {
    vi.useFakeTimers();
    store.set(socketStateAtom, SocketState.Disconnected);
    const { result } = renderHook(() => useMiniMapQuery(() => {}));

    result.current([0n, 1_000n], "8s");
    expect(sentRanges()).toEqual([]);

    store.set(socketStateAtom, SocketState.Connected);
    vi.advanceTimersByTime(400);

    expect(sentRanges()).toEqual([[0n, 1_000n]]);
  });

  it("replays the request queued behind an in-flight query on reconnect", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMiniMapQuery(() => {}));
    const query = result.current;

    // A: in flight
    query([0n, 1_000n], "8s");
    vi.advanceTimersByTime(400);
    // B: queued behind A
    query([0n, 2_000n], "8s");

    store.set(socketStateAtom, SocketState.Disconnected);
    store.set(socketStateAtom, SocketState.Connected);
    vi.advanceTimersByTime(400);

    // A never completed, so B is fetched from the start
    expect(sentRanges()).toEqual([
      [0n, 1_000n],
      [0n, 2_000n],
    ]);
  });
});
