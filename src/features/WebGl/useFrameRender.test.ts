import { describe, it, expect, beforeEach, vi } from "vitest";
import { StrictMode, useLayoutEffect } from "react";
import { renderHook } from "@testing-library/react";
import { onFrameUpdate } from "../../frameLoop";
import { useFrameRender } from "./useFrameRender";

// kept across tests: the frame loop's pending frame request outlives a test
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function runFrame() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((cb) => cb(performance.now()));
}

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.set(nextFrameId, cb);
    return nextFrameId++;
  });
});

describe("useFrameRender", () => {
  it("renders once in the next frame however many requests arrive", () => {
    const render = vi.fn();
    const { result } = renderHook(() => useFrameRender(render));

    result.current();
    result.current();
    result.current();
    expect(render).not.toHaveBeenCalled();

    runFrame();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("renders the range a clock advanced in the same frame", () => {
    let range = 0;
    const rendered: number[] = [];
    const { result } = renderHook(() =>
      useFrameRender(() => rendered.push(range)),
    );

    result.current();
    const stopClock = onFrameUpdate(() => {
      range++;
      result.current();
    });
    runFrame();
    expect(rendered).toEqual([1]);
    stopClock();
  });

  it("drops a pending render on unmount", () => {
    const render = vi.fn();
    const { result, unmount } = renderHook(() => useFrameRender(render));
    result.current();

    unmount();
    runFrame();
    expect(render).not.toHaveBeenCalled();
  });

  it("keeps rendering after StrictMode replays a mount effect that requested a render", () => {
    const render = vi.fn();
    const { result } = renderHook(
      () => {
        const requestRender = useFrameRender(render);
        useLayoutEffect(() => requestRender(), [requestRender]);
        return requestRender;
      },
      { wrapper: StrictMode },
    );

    runFrame();
    expect(render).toHaveBeenCalledTimes(1);
    result.current();
    runFrame();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("uses the latest render callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ render }) => useFrameRender(render),
      { initialProps: { render: first } },
    );
    result.current();

    rerender({ render: second });
    runFrame();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
