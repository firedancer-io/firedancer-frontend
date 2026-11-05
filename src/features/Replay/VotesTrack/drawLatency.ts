import {
  votesFastFinalizeColor,
  votesNotarColor,
  votesThresholdLineColor,
} from "../../../colors";
import type { TsRange } from "../../WebGl/webglUtils";
import { trackInsetPx } from "../layout";
import { LINE_WIDTH_PX } from "./consts";
import { clearDash, setGuideDash } from "./draw";

const TICK_STEPS_MS = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const MAX_TICKS = 3;
const DEFAULT_MAX_MS = 150;
const FINALIZED_DASH = [2, 3];

export interface LatencyChartPoint {
  ts: number;
  latencyMs: number;
  breakBefore: boolean;
}

export interface LatencyChartSeries {
  notarized: LatencyChartPoint[];
  fast: LatencyChartPoint[];
  slow: LatencyChartPoint[];
}

export function getLatencyTicks(maxMs: number) {
  const max = maxMs > 0 ? maxMs : DEFAULT_MAX_MS;
  const step =
    TICK_STEPS_MS.find((step) => Math.ceil(max / step) <= MAX_TICKS) ??
    TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
  const count = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: count }, (_, i) => (i + 1) * step);
}

interface LatencyPlotLayout {
  topPx: number;
  bottomPx: number;
  maxMs: number;
}

export function getLatencyPlotLayout(
  bottomPx: number,
  ticks: number[],
): LatencyPlotLayout {
  return {
    topPx: trackInsetPx.votes,
    bottomPx,
    maxMs: ticks[ticks.length - 1],
  };
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

interface DrawLatencyArgs {
  widthPx: number;
  visibleRangeMs: TsRange;
  series: LatencyChartSeries;
  layout: LatencyPlotLayout;
  ticks: number[];
}

export function drawLatencyChart(
  ctx: CanvasRenderingContext2D,
  { widthPx, visibleRangeMs, series, layout, ticks }: DrawLatencyArgs,
) {
  const [startMs, endMs] = visibleRangeMs;
  const pxPerMs = widthPx / (endMs - startMs);
  const toX = (ms: number) => (ms - startMs) * pxPerMs;
  const toY = (latencyMs: number) => getLatencyY(layout, latencyMs);

  ctx.strokeStyle = votesThresholdLineColor;
  ctx.lineWidth = 1;
  setGuideDash(ctx, startMs, pxPerMs);
  for (const tick of ticks) {
    const y = Math.round(toY(tick)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(widthPx, y);
    ctx.stroke();
  }
  clearDash(ctx);

  ctx.lineWidth = LINE_WIDTH_PX;
  ctx.lineJoin = "round";
  traceSeries(ctx, series.slow, votesFastFinalizeColor, FINALIZED_DASH);
  traceSeries(ctx, series.fast, votesFastFinalizeColor, []);
  traceSeries(ctx, series.notarized, votesNotarColor, []);

  function traceSeries(
    ctx: CanvasRenderingContext2D,
    points: LatencyChartPoint[],
    color: string,
    dash: number[],
  ) {
    ctx.beginPath();
    let prevX = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const { ts, latencyMs, breakBefore } = points[i];
      const x = toX(ts);
      const next = points[i + 1];
      // keep one point past each edge
      if (next && toX(next.ts) < 0) continue;
      if (x > widthPx && i > 0 && toX(points[i - 1].ts) > widthPx) break;

      const y = toY(latencyMs);
      if (breakBefore || prevX === -Infinity) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prevX = x;
    }
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
