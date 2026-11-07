import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  drawVotes,
  getFracY,
  getVotesPlotLayout,
  setGuideDash,
  type CertIcons,
} from "./draw";
import {
  CertKind,
  FADED_ALPHA,
  FAST_FINALIZE_THRESHOLD,
  ICON_SIZE_PX,
  NOTAR_THRESHOLD,
  VoteKind,
  type MarkerStyle,
} from "./consts";
import { getVisibleYLabels, minTrackPx } from "../layout";
import { votesNotarColor, votesSkippedColor } from "../../../colors";

// where in the dash pattern a timeline position lands on screen
function dashPhaseAt(timeMs: number, startMs: number, pxPerMs: number) {
  const ctx = { setLineDash: () => {}, lineDashOffset: 0 };
  setGuideDash(ctx as unknown as CanvasRenderingContext2D, startMs, pxPerMs);
  const x = (timeMs - startMs) * pxPerMs;
  return (x + ctx.lineDashOffset) % 8;
}

describe("setGuideDash", () => {
  it("keeps dashes at the same timeline position while the view scrolls", () => {
    const pxPerMs = 0.15;
    const phase = dashPhaseAt(12_345, 10_000, pxPerMs);
    for (const startMs of [10_016.7, 10_033.3, 11_000, 12_000]) {
      expect(dashPhaseAt(12_345, startMs, pxPerMs)).toBeCloseTo(phase);
    }
  });
});

describe("getVotesPlotLayout", () => {
  it("keeps the 60% and 80% cert icons apart at the votes minimum height", () => {
    const layout = getVotesPlotLayout(minTrackPx.votes);
    const gapPx =
      getFracY(layout, NOTAR_THRESHOLD) -
      getFracY(layout, FAST_FINALIZE_THRESHOLD);
    expect(gapPx).toBeGreaterThanOrEqual(ICON_SIZE_PX);
  });
});

describe("getVisibleYLabels", () => {
  const thresholdLabels = (heightPx: number) =>
    getVisibleYLabels(
      [FAST_FINALIZE_THRESHOLD, NOTAR_THRESHOLD].map((frac) => ({
        label: `${frac * 100}%`,
        top: getFracY(getVotesPlotLayout(heightPx), frac),
      })),
    ).map(({ label, besideTitle }) => ({ label, besideTitle }));

  it("moves the 80% label beside the title when squeezed below the minimum", () => {
    expect(thresholdLabels(70)).toEqual([
      { label: "60%", besideTitle: false },
      { label: "80%", besideTitle: true },
    ]);
  });

  it("drops the 80% label when it would overlap 60% below the title", () => {
    expect(thresholdLabels(minTrackPx.votes)).toEqual([
      { label: "60%", besideTitle: false },
    ]);
  });

  it("keeps beside-title labels from overlapping in a tiny track", () => {
    expect(thresholdLabels(40)).toEqual([{ label: "60%", besideTitle: true }]);
  });

  it("keeps both labels when there is room", () => {
    expect(thresholdLabels(120)).toEqual([
      { label: "60%", besideTitle: false },
      { label: "80%", besideTitle: false },
    ]);
  });
});

describe("drawVotes", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Path2D",
      class {
        points: [number, number][] = [];
        moveTo(x: number, y: number) {
          this.points.push([x, y]);
        }
        lineTo(x: number, y: number) {
          this.points.push([x, y]);
        }
        closePath() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // sparse like vote batches: one segment crosses the fade
  const sparseCurve = { ts: [20, 60], frac: [0.1, 0.9] };

  function draw(
    markerStyle: MarkerStyle,
    { curve = sparseCurve, finalizeTs = 40 } = {},
  ) {
    const iconAlphas: { icon: string; alpha: number }[] = [];
    const strokes: {
      color: string;
      alpha: number;
      points: [number, number][];
    }[] = [];
    let ownVoteFills = 0;
    const ctx = {
      globalAlpha: 1,
      strokeStyle: "",
      clearRect() {},
      setLineDash() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke(path?: { points: [number, number][] }) {
        if (path) {
          strokes.push({
            color: this.strokeStyle,
            alpha: this.globalAlpha,
            points: path.points,
          });
        }
      },
      fill() {
        ownVoteFills++;
      },
      drawImage(image: { id: string }) {
        iconAlphas.push({ icon: image.id, alpha: this.globalAlpha });
      },
    };
    const icon = (id: string) => ({ id, naturalWidth: 10, naturalHeight: 10 });
    drawVotes(ctx as unknown as CanvasRenderingContext2D, {
      widthPx: 200,
      heightPx: 100,
      visibleRangeMs: [0, 200],
      slotVotes: new Map([
        [
          1,
          {
            notar: curve,
            notarFallback: null,
            finalize: curve,
            // late skip votes, after the slot finalized
            skipAll: { ts: [100, 150], frac: [0.001, 0.002] },
            certs: new Map([
              [CertKind.Notar, 30],
              [CertKind.Finalize, finalizeTs],
              [CertKind.FastFinalize, 70],
            ]),
            ownVotes: new Map([
              [VoteKind.Notar, 20],
              [VoteKind.Finalize, 30],
            ]),
            parentReadyTs: 0,
          },
        ],
      ]),
      markerStyle,
      certIcons: {
        notarized: icon("notarized"),
        finalized: icon("finalized"),
        skipNotarized: icon("skipNotarized"),
      } as unknown as CertIcons,
    });
    return { iconAlphas, strokes, ownVoteFills };
  }

  it("fades the cert icons after the slot's first finalization", () => {
    const { iconAlphas } = draw("icon");
    expect(iconAlphas).toEqual(
      expect.arrayContaining([
        { icon: "notarized", alpha: 1 },
        { icon: "finalized", alpha: 1 },
        { icon: "finalized", alpha: FADED_ALPHA },
      ]),
    );
    expect(iconAlphas).toHaveLength(3);
  });

  function strokePoints(
    strokes: ReturnType<typeof draw>["strokes"],
    color: string,
    alpha: number,
  ) {
    return strokes
      .filter((stroke) => stroke.color === color && stroke.alpha === alpha)
      .flatMap((stroke) => stroke.points);
  }

  it("ends the solid line exactly at the fade between sparse points", () => {
    const { strokes } = draw("icon");
    const solid = strokePoints(strokes, votesNotarColor, 1);
    const faded = strokePoints(strokes, votesNotarColor, FADED_ALPHA);
    const fadeX = 40;
    expect(solid.at(-1)?.[0]).toBeCloseTo(fadeX);
    expect(faded[0][0]).toBeCloseTo(fadeX);
    expect(faded[0][1]).toBeCloseTo(solid.at(-1)![1]);
  });

  it("keeps a point at the fade that's within a pixel of the previous one", () => {
    const { strokes } = draw("icon", {
      curve: { ts: [10, 10.6, 20], frac: [0.1, 0.525, 0.9] },
      finalizeTs: 10.6,
    });
    const solid = strokePoints(strokes, votesNotarColor, 1);
    const layout = getVotesPlotLayout(100);
    expect(solid.at(-1)?.[0]).toBeCloseTo(10.6);
    expect(solid.at(-1)?.[1]).toBeCloseTo(getFracY(layout, 0.525));
  });

  it("keeps the last point before the fade when thinning dense points", () => {
    const { strokes } = draw("icon", {
      curve: { ts: [10, 10.3, 10.6, 10.9, 20], frac: [0.1, 0.2, 0.9, 0.91, 1] },
      finalizeTs: 10.6,
    });
    const solid = strokePoints(strokes, votesNotarColor, 1);
    expect(solid.at(-1)?.[0]).toBeCloseTo(10.6);
    expect(solid.at(-1)?.[1]).toBeCloseTo(
      getFracY(getVotesPlotLayout(100), 0.9),
    );
  });

  it("draws a curve that starts after the fade fully faded", () => {
    const { strokes } = draw("icon");
    expect(strokePoints(strokes, votesSkippedColor, 1)).toEqual([]);
    expect(strokePoints(strokes, votesSkippedColor, FADED_ALPHA)[0][0]).toBe(
      100,
    );
  });

  it("draws our votes only when zoomed in to icons", () => {
    expect(draw("icon").ownVoteFills).toBeGreaterThan(0);
    expect(draw("tick").ownVoteFills).toBe(0);
  });
});
