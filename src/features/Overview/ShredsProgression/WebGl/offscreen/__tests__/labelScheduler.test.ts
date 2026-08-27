import { expect, describe, it, afterEach, beforeEach, vi } from "vitest";
import type { LabelFrame } from "../../../labelsCalc";
import { createLabelScheduler, type LabelFrameMsg } from "../labelScheduler";

const V = 0.1; // px/ms

function frameAt(x: number): LabelFrame {
  return {
    maxCssPos: 1000,
    groups: [
      { slot: 100, x, w: 50, skipped: false },
      { slot: 104, x: null, w: null, skipped: false },
    ],
    slots: [{ slot: 100, x: 2, w: 10, skipped: false }],
  };
}

function msgAt(basisMs: number, x: number): LabelFrameMsg {
  return { frame: frameAt(x), basisMs, pxPerMs: V };
}

describe("createLabelScheduler", () => {
  let rafQ = new Map<number, FrameRequestCallback>();
  let rafId = 1;
  let applied: { x: number | null; frame: LabelFrame }[] = [];
  let scheduler: ReturnType<typeof createLabelScheduler<LabelFrameMsg>>;

  const runRaf = () => {
    const cbs = [...rafQ.values()];
    rafQ.clear();
    for (const cb of cbs) cb(performance.now());
  };
  const tickMs = (ms: number) => {
    vi.advanceTimersByTime(ms);
    runRaf();
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(100_000);
    rafQ = new Map();
    rafId = 1;
    applied = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQ.set(rafId, cb);
      return rafId++;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafQ.delete(id);
    });
    scheduler = createLabelScheduler((frame) => {
      applied.push({ x: frame.groups[0].x, frame });
    });
  });

  afterEach(() => {
    scheduler.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("applies frames as posted at normal cadence, no extrapolation", () => {
    for (let i = 0; i < 5; i++) {
      const msg = msgAt(Date.now() - 2, 500 - i);
      scheduler.push(msg);
      tickMs(16);
      // exact frame object, unshifted
      expect(applied[applied.length - 1].frame).toBe(msg.frame);
    }
    expect(applied.length).toBe(5);
    // idle ticks between frames apply nothing
    tickMs(16);
    expect(applied.length).toBe(5);
  });

  it("extrapolates between slow frames at the rAF cadence with uniform deltas", () => {
    scheduler.push(msgAt(Date.now() - 2, 500));
    tickMs(0);
    expect(applied.length).toBe(1);
    expect(applied[0].x).toBe(500);

    // no new frames: ticks under the threshold stay silent
    tickMs(16); // age 18
    tickMs(16); // age 34
    expect(applied.length).toBe(1);

    // past the threshold: one apply per tick, slid by V per ms
    const xs: number[] = [];
    for (let i = 0; i < 5; i++) {
      tickMs(16); // ages 50, 66, ...
      xs.push(applied[applied.length - 1].x!);
    }
    expect(applied.length).toBe(6);
    const ages = [50, 66, 82, 98, 114];
    xs.forEach((x, i) => expect(x).toBeCloseTo(500 - V * ages[i], 6));
    // uniform per-tick delta = V * 16
    for (let i = 1; i < xs.length; i++)
      expect(xs[i] - xs[i - 1]).toBeCloseTo(-V * 16, 6);
    // hidden group untouched
    const lastFrame = applied[applied.length - 1].frame;
    expect(lastFrame.groups[1].x).toBeNull();
    // slots ride their group: not rewritten
    expect(lastFrame.slots[0].x).toBe(2);
  });

  it("slides a late frame by its age, then resumes as-posted applies", () => {
    scheduler.push(msgAt(Date.now() - 2, 500));
    tickMs(0);
    for (let i = 0; i < 5; i++) tickMs(16); // extrapolating by now

    // fresh frame after a 100ms-class gap: slid by its (small) age
    scheduler.push(msgAt(Date.now() - 4, 490));
    tickMs(0);
    expect(applied[applied.length - 1].x).toBeCloseTo(490 - V * 4, 6);

    // two frames at fast cadence: second applies exactly as posted
    scheduler.push(msgAt(Date.now() - 2, 489));
    tickMs(16);
    const fast = msgAt(Date.now() - 2, 488);
    scheduler.push(fast);
    tickMs(16);
    expect(applied[applied.length - 1].frame).toBe(fast.frame);
  });

  it("parks after a silent second and re-arms on the next frame", () => {
    scheduler.push(msgAt(Date.now() - 2, 500));
    tickMs(0);
    let guard = 0;
    while (rafQ.size && guard++ < 200) tickMs(16);
    expect(guard).toBeLessThan(200); // chain ended
    const parked = applied.length;
    tickMs(16);
    expect(applied.length).toBe(parked);

    scheduler.push(msgAt(Date.now() - 2, 300));
    tickMs(0);
    expect(applied[applied.length - 1].x).toBe(300);
  });

  it("park() freezes immediately and drops pending work", () => {
    scheduler.push(msgAt(Date.now() - 2, 500));
    tickMs(0);
    scheduler.push(msgAt(Date.now() - 2, 499));
    scheduler.park();
    tickMs(16);
    tickMs(16);
    expect(applied.length).toBe(1);
  });
});
