import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { isDocumentVisibleAtom } from "../../atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import { nsPerMs } from "../../consts";
import { useAggShredsQuery } from "./ShredsTrack/useAggShredsQuery";
import { setStartupTimeAtom } from "./resetReplayState";
import { nsBucketSizes } from "./const";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const wsSend = vi.fn();
let serverMessageHandler: ((message: unknown) => void) | undefined;
vi.mock("../../api/ws/utils", () => ({
  useWebSocketSend: () => wsSend,
  useServerMessages: (handler: (message: unknown) => void) => {
    serverMessageHandler = handler;
  },
}));

const store = getDefaultStore();

// shreds world granularity stays 250ms (62.5s tiles) below a 250s world
const tileMs = 62_500;

const setNowMs = (ms: number) =>
  store.set(
    smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
    BigInt(ms * nsPerMs),
  );

const sentTileIdxs = () =>
  wsSend.mock.calls.map(([message]) => {
    const { params } = message as {
      params: { start_ns: string; granularity: string };
    };
    expect(params.granularity).toBe("250ms");
    return Number(BigInt(params.start_ns) / BigInt(tileMs * nsPerMs));
  });

const answerAll = () => {
  const ids = wsSend.mock.calls.map(
    ([message]) => (message as { id: number }).id,
  );
  wsSend.mockClear();
  for (const id of ids) {
    serverMessageHandler?.({
      type: "kv",
      topic: "timeline",
      key: "query_agg_shreds",
      id,
      value: {
        granularity: "250ms",
        reference_ts_ns: 0n,
        turbine: [],
        repair: [],
        reconstructed: [],
        published: [],
      },
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  wsSend.mockClear();
  store.set(isDocumentVisibleAtom, true);
  store.set(socketStateAtom, SocketState.Connected);
  store.set(setStartupTimeAtom, 0n);
  setNowMs(100_000);
});

afterEach(() => {
  cleanup();
  serverMessageHandler = undefined;
  vi.useRealTimers();
  store.set(socketStateAtom, SocketState.Disconnected);
});

describe("useAggQuery world prefetch", () => {
  it("prefetches the world one tile per response and stops on unmount", () => {
    const { unmount } = renderHook(() => useAggShredsQuery("prefetch-mount"));
    expect(wsSend).not.toHaveBeenCalled();

    // the world range tick starts prefetching
    setNowMs(100_001);
    vi.advanceTimersByTime(100);
    expect(sentTileIdxs()).toEqual([0]);

    answerAll();
    expect(sentTileIdxs()).toEqual([1]);
    answerAll();
    expect(wsSend).not.toHaveBeenCalled();

    setNowMs(130_000);
    vi.advanceTimersByTime(100);
    expect(sentTileIdxs()).toEqual([1]);
    answerAll();
    expect(sentTileIdxs()).toEqual([2]);

    unmount();
    wsSend.mockClear();
    setNowMs(200_000);
    vi.advanceTimersByTime(1_000);
    expect(wsSend).not.toHaveBeenCalled();
  });

  it("prefetches once connected", () => {
    store.set(socketStateAtom, SocketState.Disconnected);
    renderHook(() => useAggShredsQuery("prefetch-connect"));
    expect(wsSend).not.toHaveBeenCalled();

    store.set(socketStateAtom, SocketState.Connected);
    setNowMs(100_010);
    vi.advanceTimersByTime(100);
    expect(sentTileIdxs()).toEqual([0]);
  });

  it("gives each agg level its bucket size", () => {
    const { result } = renderHook(() => useAggShredsQuery("bucket-sizes"));
    for (const level of result.current.granularityLevels) {
      expect(level.bucketSizeNs).toBe(
        nsBucketSizes[level.id as keyof typeof nsBucketSizes],
      );
    }
  });
});
