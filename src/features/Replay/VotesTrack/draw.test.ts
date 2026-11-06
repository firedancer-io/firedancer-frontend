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
        moveTo() {}
        lineTo() {}
        closePath() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function draw(markerStyle: MarkerStyle) {
    const iconAlphas: { icon: string; alpha: number }[] = [];
    let ownVoteFills = 0;
    const ctx = {
      globalAlpha: 1,
      clearRect() {},
      setLineDash() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fill() {
        ownVoteFills++;
      },
      drawImage(image: { id: string }) {
        iconAlphas.push({ icon: image.id, alpha: this.globalAlpha });
      },
    };
    const icon = (id: string) => ({ id, naturalWidth: 10, naturalHeight: 10 });
    const curve = { ts: [10, 60], frac: [0.5, 0.9] };

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
            skipAll: { ts: [], frac: [] },
            certs: new Map([
              [CertKind.Finalize, 40],
              [CertKind.Notar, 50],
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
    return { iconAlphas, ownVoteFills };
  }

  it("fades the cert icons after the slot's first certificate", () => {
    const { iconAlphas } = draw("icon");
    expect(iconAlphas).toEqual(
      expect.arrayContaining([
        { icon: "finalized", alpha: 1 },
        { icon: "notarized", alpha: FADED_ALPHA },
        { icon: "finalized", alpha: FADED_ALPHA },
      ]),
    );
    expect(iconAlphas).toHaveLength(3);
  });

  it("draws our votes only when zoomed in to icons", () => {
    expect(draw("icon").ownVoteFills).toBeGreaterThan(0);
    expect(draw("tick").ownVoteFills).toBe(0);
  });
});
