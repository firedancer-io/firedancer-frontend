import { describe, expect, it } from "vitest";
import { getFracY, getVotesPlotLayout } from "./curvesGeometry";
import { THRESHOLD_FRACS } from "./consts";
import { minTrackPx } from "../layout";
import { getVisibleYLabels } from "./yLabels";

describe("getVisibleYLabels", () => {
  const thresholdLabels = (heightPx: number) =>
    getVisibleYLabels(
      THRESHOLD_FRACS.map((frac) => ({
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
