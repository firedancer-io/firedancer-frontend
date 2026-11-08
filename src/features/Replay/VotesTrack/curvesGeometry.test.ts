import { describe, expect, it } from "vitest";
import {
  buildVotes,
  getFracY,
  getThresholdYs,
  getVotesPlotLayout,
  type CertIcons,
  type Stroke,
} from "./curvesGeometry";
import {
  CertKind,
  FADED_ALPHA,
  FAST_FINALIZE_THRESHOLD,
  ICON_SIZE_PX,
  LINE_WIDTH_PX,
  NOTAR_THRESHOLD,
  OWN_VOTE_LINE_ALPHA,
  TICK_HALF_HEIGHT_PX,
  TICK_WIDTH_PX,
  VoteKind,
  voteLineColors,
  voteLineDashPx,
  voteLineDrawOrder,
  type MarkerStyle,
  type VoteLine,
} from "./consts";
import type { SlotVotes, StepCurve } from "./votesData";
import { minTrackPx } from "../layout";
import { votesColor, votesNotarColor } from "../../../colors";

describe("getVotesPlotLayout", () => {
  it("keeps the 60% and 80% cert icons apart at the votes minimum height", () => {
    const layout = getVotesPlotLayout(minTrackPx.votes);
    const gapPx =
      getFracY(layout, NOTAR_THRESHOLD) -
      getFracY(layout, FAST_FINALIZE_THRESHOLD);
    expect(gapPx).toBeGreaterThanOrEqual(ICON_SIZE_PX);
  });
});

const heightPx = 100;
const layout = getVotesPlotLayout(heightPx);
const toY = (frac: number) => getFracY(layout, frac);
const icon = { naturalWidth: 15, naturalHeight: 14 };
const certIcons: CertIcons = {
  notarized: icon,
  finalized: icon,
  skipNotarized: icon,
};

// sparse like vote batches: one segment crosses the fade
const sparseCurve = { ts: [20, 60], frac: [0.1, 0.9] };

function slot(
  curve: StepCurve,
  certs: [CertKind, number][],
  skipAll: StepCurve = { ts: [], frac: [] },
): SlotVotes {
  return {
    notar: curve,
    notarFallback: null,
    finalize: { ts: [], frac: [] },
    skipAll,
    certs: new Map(certs),
    ownVotes: new Map([
      [VoteKind.Notar, 20],
      [VoteKind.Finalize, 30],
    ]),
    parentReadyTs: 0,
  };
}

function build(
  slotVotes: SlotVotes[],
  markerStyle: MarkerStyle = "icon",
  iconsLoaded = true,
) {
  return buildVotes({
    heightPx,
    slotVotes,
    markerStyle,
    certIcons: iconsLoaded ? certIcons : undefined,
  });
}

function findStroke(strokes: Stroke[], line: VoteLine, alpha: number) {
  const stroke = strokes.find(
    (s) =>
      s.color === voteLineColors[line] &&
      s.dashPx === voteLineDashPx[line] &&
      s.alpha === alpha &&
      s.widthPx === LINE_WIDTH_PX,
  );
  if (!stroke) throw new Error(`no ${line} stroke at alpha ${alpha}`);
  return stroke;
}

function toPoints(segments: number[]) {
  const points: [number, number][][] = [];
  for (let i = 0; i < segments.length; i += 4) {
    points.push([
      [segments[i], segments[i + 1]],
      [segments[i + 2], segments[i + 3]],
    ]);
  }
  return points;
}

describe("buildVotes", () => {
  it("ends the solid line exactly at the fade between sparse points", () => {
    const { strokes } = build([
      slot(sparseCurve, [
        [CertKind.Notar, 30],
        [CertKind.Finalize, 40],
      ]),
    ]);
    const solid = toPoints(findStroke(strokes, "notar", 1).segments);
    const faded = toPoints(findStroke(strokes, "notar", FADED_ALPHA).segments);
    const fadeY = toY(0.1 + ((40 - 20) / (60 - 20)) * (0.9 - 0.1));
    expect(solid.at(-1)?.[1]).toEqual([40, fadeY]);
    expect(faded[0][0]).toEqual([40, fadeY]);
    expect(faded.at(-1)?.[1]).toEqual([60, toY(0.9)]);
  });

  it("starts each curve at zero stake below its first point", () => {
    const { strokes } = build([slot(sparseCurve, [])]);
    const solid = toPoints(findStroke(strokes, "notar", 1).segments);
    expect(solid[0]).toEqual([
      [20, toY(0)],
      [20, toY(0.1)],
    ]);
  });

  it("draws a curve that starts after the fade fully faded", () => {
    const { strokes } = build([
      slot(
        sparseCurve,
        [[CertKind.Finalize, 40]],
        // late skip votes, after the slot finalized
        { ts: [100, 150], frac: [0.001, 0.002] },
      ),
    ]);
    expect(findStroke(strokes, "skip", 1).segments).toEqual([]);
    expect(
      toPoints(findStroke(strokes, "skip", FADED_ALPHA).segments)[0],
    ).toEqual([
      [100, toY(0)],
      [100, toY(0.001)],
    ]);
  });

  it("draws faded lines under solid ones, each back to front", () => {
    const { strokes } = build([slot(sparseCurve, [])], "tick");
    const lineStrokes = strokes.filter((s) => s.widthPx === LINE_WIDTH_PX);
    expect(lineStrokes.map((s) => [s.color, s.alpha])).toEqual([
      ...voteLineDrawOrder.map((line) => [voteLineColors[line], FADED_ALPHA]),
      ...voteLineDrawOrder.map((line) => [voteLineColors[line], 1]),
    ]);
  });

  it("fades the cert markers after the slot's first finalization", () => {
    const { markers } = build([
      slot(sparseCurve, [
        [CertKind.Notar, 30],
        [CertKind.Finalize, 40],
        [CertKind.FastFinalize, 70],
      ]),
    ]);
    expect(
      markers.map((m) => ("icon" in m ? [m.icon, m.x, m.alpha] : [])),
    ).toEqual([
      ["notarized", 30, 1],
      ["finalized", 70, FADED_ALPHA],
    ]);
    expect(markers[1].y).toBe(toY(FAST_FINALIZE_THRESHOLD));
    expect(markers[0].y).toBe(toY(NOTAR_THRESHOLD));
  });

  it("keeps icon markers at the icon size and aspect", () => {
    const [marker] = build([slot(sparseCurve, [[CertKind.Notar, 30]])]).markers;
    expect(marker.widthPx).toBe(ICON_SIZE_PX);
    expect(marker.heightPx).toBeCloseTo((ICON_SIZE_PX * 14) / 15);
  });

  it("draws colored ticks when zoomed out or before the icons load", () => {
    for (const geometry of [
      build([slot(sparseCurve, [[CertKind.Notar, 30]])], "tick"),
      build([slot(sparseCurve, [[CertKind.Notar, 30]])], "icon", false),
    ]) {
      expect(geometry.markers).toEqual([
        {
          x: 30,
          y: toY(NOTAR_THRESHOLD),
          widthPx: TICK_WIDTH_PX,
          heightPx: TICK_HALF_HEIGHT_PX * 2,
          alpha: 1,
          color: votesNotarColor,
        },
      ]);
    }
  });

  it("draws our votes only when zoomed in to icons", () => {
    const ownVoteStrokes = (markerStyle: MarkerStyle) =>
      build([slot(sparseCurve, [])], markerStyle).strokes.filter(
        (s) => s.alpha === OWN_VOTE_LINE_ALPHA,
      );

    const iconGeometry = build([slot(sparseCurve, [])], "icon");
    expect(iconGeometry.triangles).toEqual([
      expect.objectContaining({ x: 20, color: votesNotarColor }),
      expect.objectContaining({ x: 30, color: votesColor }),
    ]);
    expect(ownVoteStrokes("icon").map((s) => s.segments)).toEqual([
      [20, layout.topPx, 20, layout.bottomPx],
      [30, layout.topPx, 30, layout.bottomPx],
    ]);

    expect(build([slot(sparseCurve, [])], "tick").triangles).toEqual([]);
    expect(ownVoteStrokes("tick")).toEqual([]);
  });

  it("places guides at the notar and fast finalize thresholds", () => {
    expect(getThresholdYs(heightPx)).toEqual([
      toY(NOTAR_THRESHOLD),
      toY(FAST_FINALIZE_THRESHOLD),
    ]);
  });
});

// deterministic so failures reproduce
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

function randomCurve(random: () => number): StepCurve {
  const ts: number[] = [];
  const frac: number[] = [];
  let t = random() * 100;
  let f = 0;
  const count = 1 + Math.floor(random() * 12);
  for (let i = 0; i < count; i++) {
    // repeated timestamps happen within a vote batch
    t += random() < 0.2 ? 0 : random() * 50;
    f = Math.min(1, f + random() * 0.2);
    ts.push(t);
    frac.push(f);
  }
  return { ts, frac };
}

function interpolateFrac({ ts, frac }: StepCurve, atTs: number) {
  const i = ts.findIndex((t) => t > atTs);
  const t = (atTs - ts[i - 1]) / (ts[i] - ts[i - 1]);
  return frac[i - 1] + t * (frac[i] - frac[i - 1]);
}

describe("buildVotes fade split", () => {
  it("matches a simple reference for random curves and fade times", () => {
    const random = createRandom(42);
    for (let run = 0; run < 500; run++) {
      const curve = randomCurve(random);
      const { ts, frac } = curve;
      const hasFade = random() < 0.9;
      const fadeTs = ts[0] - 20 + random() * (ts.at(-1)! - ts[0] + 40);
      const { strokes } = build(
        [slot(curve, hasFade ? [[CertKind.Finalize, fadeTs]] : [])],
        "tick",
      );
      const solid = findStroke(strokes, "notar", 1).segments;
      const faded = findStroke(strokes, "notar", FADED_ALPHA).segments;

      const expectedPoints: [number, number][] = [
        [ts[0], toY(0)],
        ...ts.map((t, i): [number, number] => [t, toY(frac[i])]),
      ];
      const isSplit = hasFade && fadeTs >= ts[0] && fadeTs < ts.at(-1)!;
      if (isSplit) {
        const splitIdx = ts.findIndex((t) => t > fadeTs) + 1;
        expectedPoints.splice(splitIdx, 0, [
          fadeTs,
          toY(interpolateFrac(curve, fadeTs)),
        ]);
      }

      // one continuous path through the expected points
      const segments = toPoints([...solid, ...faded]);
      expect(segments.map(([start]) => start)).toEqual(
        expectedPoints.slice(0, -1),
      );
      expect(segments.map(([, end]) => end)).toEqual(expectedPoints.slice(1));

      for (const [[x0], [x1]] of toPoints(solid)) {
        if (hasFade) expect(Math.max(x0, x1)).toBeLessThanOrEqual(fadeTs);
      }
      for (const [[x0], [x1]] of toPoints(faded)) {
        expect(Math.min(x0, x1)).toBeGreaterThanOrEqual(fadeTs);
      }
      if (!hasFade || fadeTs >= ts.at(-1)!) expect(faded).toEqual([]);
      if (hasFade && fadeTs < ts[0]) expect(solid).toEqual([]);
    }
  });
});
