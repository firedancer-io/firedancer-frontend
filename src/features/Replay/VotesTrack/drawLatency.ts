import {
  votesColor,
  votesFastFinalizeColor,
  votesNotarColor,
} from "../../../colors";
import type { TsRange } from "../../WebGl/webglUtils";
import { LINE_WIDTH_PX } from "./consts";
import {
  clearDash,
  drawThresholdLine,
  getVotesPlotLayout,
  setGuideDash,
} from "./draw";

const TICK_STEP_MULTIPLIERS = [1, 2, 2.5, 5];
const MIN_TICK_SCALE_MS = 10;
const MAX_TICKS = 3;
const DEFAULT_MAX_MS = 150;
const ISOLATED_SAMPLE_PX = 3;

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

  setGuideDash(ctx, startMs, pxPerMs);
  for (const tick of ticks) drawThresholdLine(ctx, widthPx, toY(tick));
  clearDash(ctx);

  ctx.lineWidth = LINE_WIDTH_PX;
  ctx.lineJoin = "round";
  traceSeries(series.slow, votesColor);
  traceSeries(series.fast, votesFastFinalizeColor);
  traceSeries(series.notarized, votesNotarColor);

  function traceSeries(points: LatencyChartPoint[], color: string) {
    ctx.beginPath();
    let hasStarted = false;
    for (let i = 0; i < points.length; i++) {
      const { ts, latencyMs, breakBefore } = points[i];
      const x = toX(ts);
      const next = points[i + 1];
      // keep one point past each edge
      if (next && toX(next.ts) < 0) continue;
      if (x > widthPx && i > 0 && toX(points[i - 1].ts) > widthPx) break;

      const y = toY(latencyMs);
      const isRunStart = breakBefore || !hasStarted;
      hasStarted = true;
      if (!isRunStart) {
        ctx.lineTo(x, y);
      } else if (next && !next.breakBefore) {
        ctx.moveTo(x, y);
      } else {
        ctx.moveTo(x - ISOLATED_SAMPLE_PX / 2, y);
        ctx.lineTo(x + ISOLATED_SAMPLE_PX / 2, y);
      }
    }
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}
