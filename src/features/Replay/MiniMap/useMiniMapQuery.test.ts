import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useMiniMapQuery from "./useMiniMapQuery";

const wsSend = vi.fn();
vi.mock("../../../api/ws/utils", () => ({
  useWebSocketSend: () => wsSend,
  useServerMessages: () => {},
}));

const sentRanges = () =>
  wsSend.mock.calls.map(([message]) => {
    const { params } = message as {
      params: { start_ns: string; end_ns: string };
    };
    return [BigInt(params.start_ns), BigInt(params.end_ns)];
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("useMiniMapQuery", () => {
  it("fetches the new end, and nothing when the world end steps back", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMiniMapQuery(() => {}));
    const query = result.current;

    query([0n, 1_000n], "8s");
    vi.advanceTimersByTime(1_000);
    query([0n, 2_000n], "8s");
    vi.advanceTimersByTime(1_000);
    // the smoothed clock stepped back
    query([0n, 1_900n], "8s");
    vi.advanceTimersByTime(1_000);
    query([0n, 2_500n], "8s");
    vi.advanceTimersByTime(1_000);

    expect(sentRanges()).toEqual([
      [0n, 1_000n],
      [1_000n, 2_000n],
      [2_000n, 2_500n],
    ]);
    for (const [start, end] of sentRanges()) expect(end).toBeGreaterThan(start);
  });
});
