import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { firstFlushAppliedAtom } from "../../api/ws/atoms";
import { firstFlushRevealCapMs } from "../../consts";
import { useFirstFlushReveal } from "../useFirstFlushReveal";
import { shellStaleEvent } from "../../shellVerifier";

const store = getDefaultStore();

beforeEach(() => {
  store.set(firstFlushAppliedAtom, false);
  delete window.__fdShellStale;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFirstFlushReveal", () => {
  test("pre-mount apply: reveals in the very first render", () => {
    store.set(firstFlushAppliedAtom, true);
    const { result } = renderHook(() => useFirstFlushReveal());
    expect(result.current).toBe(true);
  });

  test("post-mount apply: hidden until the first flush lands", () => {
    const { result } = renderHook(() => useFirstFlushReveal());
    expect(result.current).toBe(false);
    act(() => store.set(firstFlushAppliedAtom, true));
    expect(result.current).toBe(true);
  });

  test("stale shell before mount: reveal held", () => {
    store.set(firstFlushAppliedAtom, true);
    window.__fdShellStale = true;
    const { result } = renderHook(() => useFirstFlushReveal());
    expect(result.current).toBe(false);
  });

  test("stale shell answer after mount: reveal withdrawn", () => {
    store.set(firstFlushAppliedAtom, true);
    const { result } = renderHook(() => useFirstFlushReveal());
    expect(result.current).toBe(true);
    act(() => {
      window.__fdShellStale = true;
      window.dispatchEvent(new Event(shellStaleEvent));
    });
    expect(result.current).toBe(false);
  });

  test("pending verifier answer never blocks the reveal", () => {
    // no answer arrived: __fdShellStale unset
    store.set(firstFlushAppliedAtom, true);
    const { result } = renderHook(() => useFirstFlushReveal());
    expect(result.current).toBe(true);
  });

  test("slow origin: reveals at the cap without data", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFirstFlushReveal());
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(firstFlushRevealCapMs - 1);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });
});
