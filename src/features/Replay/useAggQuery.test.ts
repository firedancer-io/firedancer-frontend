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

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const wsSend = vi.fn();
vi.mock("../../api/ws/utils", () => ({
  useWebSocketSend: () => wsSend,
  useServerMessages: () => {},
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
  vi.useRealTimers();
  store.set(socketStateAtom, SocketState.Disconnected);
});

describe("useAggQuery world prefetch", () => {
  it("prefetches the world on mount and follows it until unmount", () => {
    const { unmount } = renderHook(() => useAggShredsQuery("prefetch-mount"));
    expect(sentTileIdxs()).toEqual([0, 1]);

    wsSend.mockClear();
    setNowMs(130_000);
    vi.advanceTimersByTime(100);
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
    expect(sentTileIdxs()).toEqual([0, 1]);
  });
});
