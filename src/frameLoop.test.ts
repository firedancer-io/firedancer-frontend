import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cancelFrameRender,
  onFrameUpdate,
  requestFrameRender,
} from "./frameLoop";

// kept across tests: the loop's pending frame request outlives a test
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let frameTimeMs = 0;

function runFrame() {
  frameTimeMs += 16;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((cb) => cb(frameTimeMs));
}

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.set(nextFrameId, cb);
    return nextFrameId++;
  });
});

describe("frameLoop", () => {
  it("renders a pending render after the frame's clock update", () => {
    let range = 0;
    const rendered: number[] = [];
    const render = () => rendered.push(range);
    // pending from before the frame, e.g. a hover
    requestFrameRender(render);
    const stopClock = onFrameUpdate(() => {
      range++;
      requestFrameRender(render);
    });
    runFrame();
    expect(rendered).toEqual([1]);
    stopClock();
  });

  it("renders once per frame however many requests arrive", () => {
    const render = vi.fn();
    for (let frame = 0; frame < 3; frame++) {
      for (let i = 0; i < 20; i++) requestFrameRender(render);
      runFrame();
    }
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("runs a clock every frame until it stops, then goes idle", () => {
    const clock = vi.fn();
    const stopClock = onFrameUpdate(clock);
    runFrame();
    runFrame();
    expect(clock).toHaveBeenCalledTimes(2);

    stopClock();
    runFrame();
    expect(clock).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
  });

  it("keeps running a clock that throws", () => {
    const rethrow = vi
      .spyOn(window, "setTimeout")
      .mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);
    const clock = vi.fn(() => {
      throw new Error("clock failed");
    });
    const stopClock = onFrameUpdate(clock);
    runFrame();
    runFrame();
    expect(clock).toHaveBeenCalledTimes(2);
    stopClock();
    rethrow.mockRestore();
  });

  it("passes the frame time to clocks", () => {
    const clock = vi.fn();
    const stopClock = onFrameUpdate(clock);
    runFrame();
    expect(clock).toHaveBeenCalledWith(frameTimeMs);
    stopClock();
  });

  it("skips a callback cancelled earlier in the same frame", () => {
    const render = vi.fn();
    const staleClock = vi.fn();
    requestFrameRender(render);
    let stopStaleClock = () => {};
    const stopClock = onFrameUpdate(() => {
      cancelFrameRender(render);
      stopStaleClock();
    });
    stopStaleClock = onFrameUpdate(staleClock);

    runFrame();
    expect(render).not.toHaveBeenCalled();
    expect(staleClock).not.toHaveBeenCalled();
    stopClock();
  });

  it("runs the rest of the frame when a callback throws", () => {
    const rethrow = vi
      .spyOn(window, "setTimeout")
      .mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);
    const render = vi.fn();
    const stopClock = onFrameUpdate(() => {
      throw new Error("clock failed");
    });
    requestFrameRender(render);

    runFrame();
    expect(render).toHaveBeenCalledTimes(1);
    expect(rethrow).toHaveBeenCalledTimes(1);
    stopClock();
    rethrow.mockRestore();
  });
});
