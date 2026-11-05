import { describe, expect, it } from "vitest";
import { getFracY, getVotesPlotLayout, setGuideDash } from "./draw";
import {
  FAST_FINALIZE_THRESHOLD,
  ICON_SIZE_PX,
  NOTAR_THRESHOLD,
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

  it("moves the 80% label beside the title at the votes minimum height", () => {
    expect(thresholdLabels(minTrackPx.votes)).toEqual([
      { label: "60%", besideTitle: false },
      { label: "80%", besideTitle: true },
    ]);
  });

  it("drops the 80% label when it would overlap 60% below the title", () => {
    expect(thresholdLabels(86)).toEqual([{ label: "60%", besideTitle: false }]);
  });

  it("keeps both labels when there is room", () => {
    expect(thresholdLabels(120)).toEqual([
      { label: "60%", besideTitle: false },
      { label: "80%", besideTitle: false },
    ]);
  });
});
