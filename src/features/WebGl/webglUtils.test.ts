import { describe, expect, it } from "vitest";
import { getWholePxRange, type TsRange } from "./webglUtils";

describe("getWholePxRange", () => {
  it("moves the range to a whole px within half a px, keeping its size", () => {
    for (let i = 0; i < 1000; i++) {
      const widthPx = 1 + Math.floor(Math.random() * 4000);
      const startMs = Math.random() * 1e8;
      const range: TsRange = [startMs, startMs + 1 + Math.random() * 600_000];
      const windowSizeMs = range[1] - range[0];
      const msPerPx = windowSizeMs / widthPx;

      const [wholeStartMs, wholeEndMs] = getWholePxRange(range, widthPx);
      const startPx = wholeStartMs / msPerPx;

      expect(Math.abs(startPx - Math.round(startPx))).toBeLessThan(1e-3);
      expect(Math.abs(wholeStartMs - startMs)).toBeLessThanOrEqual(
        msPerPx / 2 + 1e-9 * startMs,
      );
      expect(wholeEndMs - wholeStartMs).toBeCloseTo(windowSizeMs, 6);
    }
  });

  it("moves by whole px when panning by a fraction of a px", () => {
    const widthPx = 1800;
    const windowSizeMs = 300_000;
    const msPerPx = windowSizeMs / widthPx;
    let startMs = 5_000_000;
    const startPx = () =>
      getWholePxRange([startMs, startMs + windowSizeMs], widthPx)[0] / msPerPx;
    let prevPx = startPx();
    for (let frame = 0; frame < 500; frame++) {
      startMs += Math.random() * 3 * msPerPx;
      const px = startPx();
      const step = px - prevPx;
      expect(Math.abs(step - Math.round(step))).toBeLessThan(1e-6);
      prevPx = px;
    }
  });

  it("returns the range unchanged without a width", () => {
    expect(getWholePxRange([12.3, 45.6], 0)).toEqual([12.3, 45.6]);
  });
});
