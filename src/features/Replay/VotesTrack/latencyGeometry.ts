import {
  votesColor,
  votesFastFinalizeColor,
  votesNotarColor,
} from "../../../colors";
import type { TsRange } from "../../WebGl/webglUtils";
import { LINE_WIDTH_PX } from "./consts";
import {
  addSegment,
  getVotesPlotLayout,
  type Marker,
  type Stroke,
  type VotesGeometry,
} from "./curvesGeometry";

const TICK_STEP_MULTIPLIERS = [1, 2, 2.5, 5];
const MIN_TICK_SCALE_MS = 10;
const MAX_TICKS = 3;
const DEFAULT_MAX_MS = 150;
const ISOLATED_SAMPLE_PX = 3;

export interface LatencyChartPoint {
  // undefined for aggregate buckets
  slot: number | undefined;
  ts: number;
  latencyMs: number;
  breakBefore: boolean;
}

export interface LatencyChartSeries {
  notarized: LatencyChartPoint[];
  fast: LatencyChartPoint[];
  slow: LatencyChartPoint[];
}

export function formatLatencyTick(ms: number) {
  return ms < 1_000 ? `${ms} ms` : `${ms / 1_000} s`;
}

export function getLatencyTicks(maxMs: number) {
  const max = maxMs > 0 ? maxMs : DEFAULT_MAX_MS;
  const scale = Math.max(
    MIN_TICK_SCALE_MS,
    10 ** Math.floor(Math.log10(max / MAX_TICKS)),
  );
  const step =
    TICK_STEP_MULTIPLIERS.map((multiplier) => multiplier * scale).find(
      (step) => Math.ceil(max / step) <= MAX_TICKS,
    ) ?? 10 * scale;
  const count = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: count }, (_, i) => (i + 1) * step);
}

interface LatencyPlotLayout {
  topPx: number;
  bottomPx: number;
  maxMs: number;
}

export function getLatencyPlotLayout(
  heightPx: number,
  ticks: number[],
): LatencyPlotLayout {
  return { ...getVotesPlotLayout(heightPx), maxMs: ticks[ticks.length - 1] };
}

export function getLatencyY(
  { topPx, bottomPx, maxMs }: LatencyPlotLayout,
  latencyMs: number,
) {
  const clamped = Math.min(Math.max(latencyMs, 0), maxMs);
  return bottomPx - (clamped / maxMs) * (bottomPx - topPx);
}

export function getVisibleMaxLatency(
  series: LatencyChartSeries,
  [startMs, endMs]: TsRange,
) {
  let max = 0;
  for (const points of [series.notarized, series.fast, series.slow]) {
    for (const { ts, latencyMs } of points) {
      if (ts >= startMs && ts <= endMs && latencyMs > max) max = latencyMs;
    }
  }
  return max;
}

interface BuildLatencyArgs {
  series: LatencyChartSeries;
  layout: LatencyPlotLayout;
  ticks: number[];
}

export function buildLatency({
  series,
  layout,
  ticks,
}: BuildLatencyArgs): VotesGeometry & { guideYs: number[] } {
  const toY = (latencyMs: number) => getLatencyY(layout, latencyMs);
  const markers: Marker[] = [];

  function traceSeries(points: LatencyChartPoint[], color: string): Stroke {
    const stroke: Stroke = {
      color,
      alpha: 1,
      widthPx: LINE_WIDTH_PX,
      dashPx: 0,
      segments: [],
      slots: [],
    };
    for (let i = 0; i < points.length; i++) {
      const { slot, ts, latencyMs, breakBefore } = points[i];
      const y = toY(latencyMs);
      const next = points[i + 1];
      if (i > 0 && !breakBefore) {
        // each half of the line takes the slot of its point
        const prev = points[i - 1];
        const prevY = toY(prev.latencyMs);
        const midX = (prev.ts + ts) / 2;
        const midY = (prevY + y) / 2;
        addSegment(stroke, prev.slot, prev.ts, prevY, midX, midY);
        addSegment(stroke, slot, midX, midY, ts, y);
      } else if (!next || next.breakBefore) {
        markers.push({
          slot,
          x: ts,
          y,
          widthPx: ISOLATED_SAMPLE_PX,
          heightPx: LINE_WIDTH_PX,
          alpha: 1,
          color,
        });
      }
    }
    return stroke;
  }

  return {
    guideYs: ticks.map(toY),
    strokes: [
      traceSeries(series.slow, votesColor),
      traceSeries(series.fast, votesFastFinalizeColor),
      traceSeries(series.notarized, votesNotarColor),
    ],
    markers,
    triangles: [],
  };
}
