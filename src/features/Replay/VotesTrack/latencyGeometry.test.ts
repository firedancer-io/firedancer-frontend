import { describe, expect, it } from "vitest";
import { LINE_WIDTH_PX } from "./consts";
import {
  votesColor,
  votesFastFinalizeColor,
  votesNotarColor,
} from "../../../colors";
import {
  buildLatency,
  formatLatencyTick,
  getLatencyPlotLayout,
  getLatencyTicks,
  getLatencyY,
  type LatencyChartPoint,
} from "./latencyGeometry";

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
  slot?: number,
): LatencyChartPoint => ({ slot, ts, latencyMs, breakBefore });

describe("formatLatencyTick", () => {
  it("switches to seconds from 1s", () => {
    expect(formatLatencyTick(250)).toBe("250 ms");
    expect(formatLatencyTick(2_500)).toBe("2.5 s");
  });
});

const ticks = getLatencyTicks(200);
const layout = getLatencyPlotLayout(100, ticks);
const toY = (latencyMs: number) => getLatencyY(layout, latencyMs);

function build(notarized: LatencyChartPoint[]) {
  return buildLatency({
    series: { notarized, fast: [], slow: [] },
    layout,
    ticks,
  });
}

describe("buildLatency", () => {
  it("draws a lone sample between gaps as a short marker", () => {
    const { strokes, markers } = build([
      point(20, 150),
      point(50, 100, true),
      point(80, 150, true),
    ]);
    expect(strokes.every((s) => s.segments.length === 0)).toBe(true);
    expect(markers).toContainEqual({
      slot: undefined,
      x: 50,
      y: toY(100),
      widthPx: 3,
      heightPx: LINE_WIDTH_PX,
      alpha: 1,
      color: votesNotarColor,
    });
    expect(markers).toHaveLength(3);
  });

  it("draws finalized, fast finalized then notarized lines", () => {
    expect(build([]).strokes.map((s) => s.color)).toEqual([
      votesColor,
      votesFastFinalizeColor,
      votesNotarColor,
    ]);
  });

  it("clamps samples above the top tick to the top", () => {
    const [{ segments }] = build([point(0, 50), point(10, 900)]).strokes.slice(
      -1,
    );
    const topY = toY(ticks.at(-1)!);
    const midY = (toY(50) + topY) / 2;
    expect(segments).toEqual([0, toY(50), 5, midY, 5, midY, 10, topY]);
  });

  it("gives each half of a line the slot of its nearer point", () => {
    const { strokes, markers } = build([
      point(0, 50, false, 7),
      point(10, 100, false, 8),
      point(30, 50, true, 10),
    ]);
    const notarized = strokes.at(-1)!;
    expect(notarized.slots).toEqual([7, 8]);
    expect(markers.map((m) => m.slot)).toEqual([10]);
  });

  it("places guides at the ticks", () => {
    expect(build([]).guideYs).toEqual(ticks.map(toY));
  });

  it("joins only neighbors without a gap between them", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32;
      return seed / 2 ** 32;
    };
    for (let run = 0; run < 300; run++) {
      const points = Array.from({ length: Math.floor(random() * 15) }, (_, i) =>
        point(i * 10, random() * 200, random() < 0.3),
      );
      const { strokes, markers } = build(points);
      const segments = strokes.at(-1)!.segments;

      const expectedSegments: number[] = [];
      const expectedLone: number[] = [];
      points.forEach(({ ts, latencyMs, breakBefore }, i) => {
        const prev = points[i - 1];
        const next = points[i + 1];
        if (prev && !breakBefore) {
          const midX = (prev.ts + ts) / 2;
          const midY = (toY(prev.latencyMs) + toY(latencyMs)) / 2;
          expectedSegments.push(prev.ts, toY(prev.latencyMs), midX, midY);
          expectedSegments.push(midX, midY, ts, toY(latencyMs));
        }
        const joinsPrev = prev && !breakBefore;
        const joinsNext = next && !next.breakBefore;
        if (!joinsPrev && !joinsNext) expectedLone.push(ts);
      });
      expect(segments).toEqual(expectedSegments);
      expect(markers.map(({ x }) => x)).toEqual(expectedLone);
    }
  });
});
