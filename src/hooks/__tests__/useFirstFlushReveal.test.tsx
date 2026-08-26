import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { firstFlushAppliedAtom } from "../../api/ws/atoms";
import { firstFlushRevealCapMs } from "../../consts";
import { useFirstFlushReveal } from "../useFirstFlushReveal";

const store = getDefaultStore();

beforeEach(() => {
  store.set(firstFlushAppliedAtom, false);
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
