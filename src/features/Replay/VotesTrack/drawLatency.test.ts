import { describe, expect, it } from "vitest";
import {
  drawLatencyChart,
  formatLatencyTick,
  getLatencyPlotLayout,
  getLatencyTicks,
  getLatencyY,
  type LatencyChartPoint,
} from "./drawLatency";

describe("getLatencyTicks", () => {
  it("picks at most 3 evenly spaced round ticks covering the max", () => {
    expect(getLatencyTicks(140)).toEqual([50, 100, 150]);
    expect(getLatencyTicks(340)).toEqual([200, 400]);
    expect(getLatencyTicks(260)).toEqual([100, 200, 300]);
  });

  it("keeps at most 3 ticks for very long latencies", () => {
    expect(getLatencyTicks(60_000)).toEqual([20_000, 40_000, 60_000]);
    expect(getLatencyTicks(31_000)).toEqual([20_000, 40_000]);
    expect(getLatencyTicks(7_000)).toEqual([2_500, 5_000, 7_500]);
    expect(getLatencyTicks(1_600_001)).toEqual([1_000_000, 2_000_000]);
  });

  it("falls back to a default scale without data", () => {
    expect(getLatencyTicks(0)).toEqual([50, 100, 150]);
  });
});

const point = (
  ts: number,
  latencyMs: number,
  breakBefore = false,
): LatencyChartPoint => ({ ts, latencyMs, breakBefore });

describe("formatLatencyTick", () => {
  it("switches to seconds from 1s", () => {
    expect(formatLatencyTick(250)).toBe("250 ms");
    expect(formatLatencyTick(2_500)).toBe("2.5 s");
  });
});

describe("drawLatencyChart", () => {
  it("draws a lone sample between gaps", () => {
    const lines: [number, number][] = [];
    const ctx = {
      setLineDash() {},
      beginPath() {},
      moveTo() {},
      lineTo(x: number, y: number) {
        lines.push([x, y]);
      },
      stroke() {},
    };
    const ticks = getLatencyTicks(200);
    const layout = getLatencyPlotLayout(100, ticks);
    drawLatencyChart(ctx as unknown as CanvasRenderingContext2D, {
      widthPx: 100,
      visibleRangeMs: [0, 100],
      series: {
        notarized: [point(20, 150), point(50, 100, true), point(80, 150, true)],
        fast: [],
        slow: [],
      },
      layout,
      ticks,
    });

    const sampleY = getLatencyY(layout, 100);
    expect(lines.some(([x, y]) => y === sampleY && x > 50 && x < 55)).toBe(
      true,
    );
  });
});
