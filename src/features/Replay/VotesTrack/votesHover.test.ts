import { describe, expect, it } from "vitest";
import { CertKind, VoteKind, type MarkerStyle } from "./consts";
import {
  buildVotes,
  getFracY,
  getVotesPlotLayout,
  type CertIcons,
  type Stroke,
  type VotesGeometry,
} from "./curvesGeometry";
import {
  buildLatency,
  getLatencyPlotLayout,
  getLatencyY,
  type LatencyChartPoint,
} from "./latencyGeometry";
import type { SlotVotes, StepCurve } from "./votesData";
import { HOVER_TOLERANCE_PX, getDrawnSlotAtPoint } from "./votesHover";

const HEIGHT_PX = 100;
// 1 px per ms keeps the px math readable
const PX_PER_MS = 1;
const layout = getVotesPlotLayout(HEIGHT_PX);
const fracY = (frac: number) => getFracY(layout, frac);
const empty: StepCurve = { ts: [], frac: [] };
// square 11px icons
const icon = { naturalWidth: 11, naturalHeight: 11 };
const certIcons: CertIcons = {
  notarized: icon,
  finalized: icon,
  skipNotarized: icon,
};

function votes(slot: number, overrides: Partial<SlotVotes> = {}): SlotVotes {
  return {
    slot,
    notar: empty,
    notarFallback: null,
    finalize: empty,
    skip: empty,
    certs: new Map(),
    ownVotes: new Map(),
    parentReadyTs: undefined,
    rewardAckTs: undefined,
    ...overrides,
  };
}

// hit tests the curves as buildVotes draws them
function curvesSlotAt(
  slotVotes: SlotVotes[],
  ms: number,
  y: number,
  markerStyle: MarkerStyle = "icon",
) {
  const geometry = buildVotes({
    heightPx: HEIGHT_PX,
    slotVotes,
    markerStyle,
    certIcons,
  });
  return getDrawnSlotAtPoint([geometry], { ms, y, pxPerMs: PX_PER_MS });
}

describe("getDrawnSlotAtPoint on curves", () => {
  // two overlapping notar curves: slot 1 rises earlier and higher
  const slot1 = votes(1, { notar: { ts: [0, 100], frac: [0.5, 1] } });
  const slot2 = votes(2, { notar: { ts: [50, 150], frac: [0.1, 0.4] } });

  it("picks the curve under the cursor, not the slot on the timeline", () => {
    // slot 1's line from (0, 50%) to (100, 100%) is at 75% at ms 50
    expect(curvesSlotAt([slot1, slot2], 50, fracY(0.75))).toBe(1);
    expect(curvesSlotAt([slot1, slot2], 50, fracY(0.1))).toBe(2);
  });

  it("picks the nearer of two curves", () => {
    const pxPerFrac = layout.bottomPx - layout.topPx;
    // flat curves 4 px apart
    const upper = votes(8, { notar: { ts: [0, 100], frac: [0.5, 0.5] } });
    const lower = votes(9, {
      notar: { ts: [0, 100], frac: [0.5 - 4 / pxPerFrac, 0.5 - 4 / pxPerFrac] },
    });
    expect(curvesSlotAt([upper, lower], 50, fracY(0.5) + 1)).toBe(8);
    expect(curvesSlotAt([upper, lower], 50, fracY(0.5) + 3)).toBe(9);
  });

  it("hovers a curve at any height in the track", () => {
    expect(curvesSlotAt([slot1], 50, layout.bottomPx)).toBe(1);
    expect(curvesSlotAt([slot1], 50, 0)).toBe(1);
  });

  it("hovers only within tolerance of the curve's x", () => {
    // slot 1's curve ends at ms 100
    expect(curvesSlotAt([slot1], 100 + HOVER_TOLERANCE_PX - 1, 0)).toBe(1);
    expect(
      curvesSlotAt([slot1], 100 + HOVER_TOLERANCE_PX + 1, 0),
    ).toBeUndefined();
  });

  it("hovers the rise from 0 at the first vote", () => {
    expect(curvesSlotAt([slot1], 0, fracY(0.25))).toBe(1);
  });

  it("is undefined away from anything drawn", () => {
    expect(curvesSlotAt([slot1, slot2], 300, fracY(0.5))).toBeUndefined();
    expect(curvesSlotAt([], 50, fracY(0.5))).toBeUndefined();
  });

  it("prefers a cert marker under the cursor over a nearer curve", () => {
    // slot 3's notar cert icon sits at the 60% line at ms 60
    const slot3 = votes(3, {
      notar: { ts: [40, 200], frac: [0.6, 0.7] },
      certs: new Map([[CertKind.Notar, 60]]),
    });
    // slot 4's curve passes right through the cursor
    const slot4 = votes(4, { notar: { ts: [0, 120], frac: [0.6, 0.6] } });
    expect(curvesSlotAt([slot4, slot3], 62, fracY(0.6) + 3)).toBe(3);
  });

  it("places fast finalization markers at 80%", () => {
    const slot5 = votes(5, {
      notar: { ts: [0, 10], frac: [0.1, 0.9] },
      certs: new Map([[CertKind.FastFinalize, 500]]),
    });
    expect(curvesSlotAt([slot5], 500, fracY(0.8))).toBe(5);
    expect(curvesSlotAt([slot5], 500, fracY(0.6))).toBeUndefined();
  });

  it("hovers our vote lines and triangles only where they're drawn", () => {
    const slot6 = votes(6, { ownVotes: new Map([[VoteKind.Notar, 400]]) });
    expect(curvesSlotAt([slot6], 401, fracY(0.3))).toBe(6);
    expect(curvesSlotAt([slot6], 400, layout.topPx - 3)).toBe(6);
    expect(
      curvesSlotAt([slot6], 400 + HOVER_TOLERANCE_PX + 1, fracY(0.3)),
    ).toBeUndefined();
    // tick markers don't draw our votes
    expect(curvesSlotAt([slot6], 401, fracY(0.3), "tick")).toBeUndefined();
  });

  it("hovers the summed skip curve", () => {
    const slot7 = votes(7, { skip: { ts: [0, 100], frac: [0.2, 0.2] } });
    expect(curvesSlotAt([slot7], 50, fracY(0.2))).toBe(7);
  });
});

describe("getDrawnSlotAtPoint ties", () => {
  const stroke = (slot: number | undefined): Stroke => ({
    color: "#fff",
    alpha: 1,
    widthPx: 1,
    dashPx: 0,
    // a flat segment at y 50 from ms 0 to 100
    segments: [0, 50, 100, 50],
    slots: [slot],
  });
  const geometry = (overrides: Partial<VotesGeometry>): VotesGeometry => ({
    strokes: [],
    markers: [],
    triangles: [],
    ...overrides,
  });
  const at = { ms: 50, y: 50, pxPerMs: PX_PER_MS };
  const marker = (slot: number) => ({
    slot,
    x: 50,
    y: 50,
    widthPx: 10,
    heightPx: 10,
    alpha: 1,
    color: "#fff",
  });

  it("goes to the stroke drawn later", () => {
    expect(
      getDrawnSlotAtPoint([geometry({ strokes: [stroke(1), stroke(2)] })], at),
    ).toBe(2);
  });

  it("goes to markers over triangles", () => {
    expect(
      getDrawnSlotAtPoint(
        [geometry({ markers: [marker(1)], triangles: [marker(2)] })],
        at,
      ),
    ).toBe(1);
  });

  it("skips what has no slot", () => {
    expect(
      getDrawnSlotAtPoint([geometry({ strokes: [stroke(undefined)] })], at),
    ).toBeUndefined();
  });
});

describe("getDrawnSlotAtPoint on latency", () => {
  const ticks = [100, 200];
  const latencyLayout = getLatencyPlotLayout(HEIGHT_PX, ticks);
  const point = (
    slot: number | undefined,
    ts: number,
    latencyMs: number,
  ): LatencyChartPoint => ({ slot, ts, latencyMs, breakBefore: false });
  const geometry = buildLatency({
    series: {
      notarized: [point(1, 100, 50), point(2, 500, 60)],
      fast: [point(1, 110, 150)],
      slow: [point(undefined, 300, 80)],
    },
    layout: latencyLayout,
    ticks,
  });
  const slotAt = (ms: number, latencyMs: number) =>
    getDrawnSlotAtPoint([geometry], {
      ms,
      y: getLatencyY(latencyLayout, latencyMs),
      pxPerMs: PX_PER_MS,
    });

  it("gives each half of a line its point's slot", () => {
    expect(slotAt(101, 50)).toBe(1);
    expect(slotAt(250, 50)).toBe(1);
    expect(slotAt(350, 60)).toBe(2);
    expect(slotAt(499, 60)).toBe(2);
  });

  it("hovers isolated points", () => {
    expect(slotAt(110, 150)).toBe(1);
  });

  it("skips agg points", () => {
    const aggOnly = buildLatency({
      series: { notarized: [], fast: [], slow: [point(undefined, 300, 80)] },
      layout: latencyLayout,
      ticks,
    });
    expect(
      getDrawnSlotAtPoint([aggOnly], {
        ms: 300,
        y: getLatencyY(latencyLayout, 80),
        pxPerMs: PX_PER_MS,
      }),
    ).toBeUndefined();
  });

  it("hovers at any height in the track", () => {
    expect(slotAt(499, 200)).toBe(2);
  });
});
