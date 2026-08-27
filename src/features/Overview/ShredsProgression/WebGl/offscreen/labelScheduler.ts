import type { LabelFrame } from "../../labelsCalc";

/**
 * rAF-coalesced label-frame application with slow-draw extrapolation.
 * Frames arrive per chart-worker draw tick; when draws run slower than
 * the display (heavy drawScene on weak raster stacks) labels would step
 * at the draw cadence, so between frames the last frame is re-applied
 * each display frame with its group positions slid along the same
 * wall-clock model drawScene derives its xRange from:
 * x(t) = x(basis) - pxPerMs * (t - basis). Slot labels are stored
 * group-relative and don't move between data changes. At normal draw
 * cadence frames apply as posted and no extrapolation ever runs.
 */

export interface LabelFrameMsg {
  frame: LabelFrame;
  /** Date.now() the frame's xRange derives from (worker clock) */
  basisMs: number;
  /** css px labels slide left per ms of wall time */
  pxPerMs: number;
}

// draws slower than this are extrapolated between frames; normal cadence
// (~16ms tick + hop) stays clear of it
const EXTRAPOLATE_AFTER_MS = 40;
// a silent worker (reset, gates closed) parks rather than gliding away
const EXTRAPOLATE_MAX_MS = 1000;

export function createLabelScheduler<T extends LabelFrameMsg>(
  apply: (frame: LabelFrame, msg: T) => void,
) {
  let pending: T | null = null;
  let last: T | null = null;
  let raf = 0;
  let extrapolating = false;

  function shifted(msg: T, nowMs: number): LabelFrame {
    const dx = msg.pxPerMs * (nowMs - msg.basisMs);
    const frame = msg.frame;
    return {
      ...frame,
      groups: frame.groups.map((g) =>
        g.x == null ? g : { ...g, x: g.x - dx },
      ),
    };
  }

  function tick() {
    raf = 0;
    const nowMs = Date.now();
    const msg = pending;
    if (msg) {
      pending = null;
      // once the cadence is fast again, back to as-posted applies; while
      // still slow, slide the fresh frame by its age so the extrapolated
      // positions can't step backwards
      if (last && msg.basisMs - last.basisMs <= EXTRAPOLATE_AFTER_MS)
        extrapolating = false;
      apply(extrapolating ? shifted(msg, nowMs) : msg.frame, msg);
      last = msg;
      schedule();
      return;
    }
    if (!last) return;
    const age = nowMs - last.basisMs;
    if (age > EXTRAPOLATE_MAX_MS) {
      extrapolating = false;
      return; // parked; the next frame re-arms
    }
    if (age >= EXTRAPOLATE_AFTER_MS) {
      extrapolating = true;
      apply(shifted(last, nowMs), last);
    }
    schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  return {
    push(msg: T) {
      pending = msg;
      schedule();
    },
    /** freeze in place (disconnect / startup reset): no more extrapolation */
    park() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pending = null;
      last = null;
      extrapolating = false;
    },
    stop() {
      this.park();
    },
  };
}
