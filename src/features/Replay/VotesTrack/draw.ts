import {
  votesImplicitColor,
  votesFastFinalizeColor,
  votesIconBackgroundColor,
  votesNotarColor,
  votesSkippedColor,
  votesSlowColor,
  votesStripFastColor,
  votesStripImplicitColor,
  votesStripSlowColor,
  votesStripSkippedColor,
  votesThresholdLineColor,
} from "../../../colors";
import type { TsRange } from "../../WebGl/webglUtils";
import type { SlotInfo } from "../HeaderTrack/nonAggAtoms";
import { trackInsetPx } from "../layout";
import {
  CertKind,
  ICON_RADIUS_PX,
  ICON_STROKE_PX,
  TICK_HALF_HEIGHT_PX,
  TICK_WIDTH_PX,
  FAST_FINALIZE_THRESHOLD,
  LINE_WIDTH_PX,
  NOTAR_THRESHOLD,
  STRIP_CELL_GAP_PX,
  STRIP_GAP_PX,
  STRIP_PX,
  voteLineDashes,
  voteLineDrawOrder,
  type MarkerStyle,
  type SlotOutcome,
  type VoteLine,
} from "./consts";
import { getSlotOutcome, type SlotVotes, type StepCurve } from "./votesData";

const THRESHOLD_DASH = [4, 4];

const lineColors: Record<SlotOutcome, string> = {
  fast: votesNotarColor,
  slow: votesSlowColor,
  implicit: votesImplicitColor,
  skipped: votesSkippedColor,
};

const stripColors: Record<SlotOutcome, string> = {
  fast: votesStripFastColor,
  slow: votesStripSlowColor,
  implicit: votesStripImplicitColor,
  skipped: votesStripSkippedColor,
};

interface VotesPlotLayout {
  topPx: number;
  bottomPx: number;
  stripTopPx: number;
}

export function getVotesPlotLayout(heightPx: number): VotesPlotLayout {
  const stripTopPx = heightPx - STRIP_PX;
  return {
    topPx: trackInsetPx.votes,
    bottomPx: stripTopPx - STRIP_GAP_PX,
    stripTopPx,
  };
}

export function getFracY({ topPx, bottomPx }: VotesPlotLayout, frac: number) {
  return bottomPx - frac * (bottomPx - topPx);
}

interface Marker {
  x: number;
  y: number;
  color: string;
  filled: boolean;
}

interface DrawVotesArgs {
  widthPx: number;
  heightPx: number;
  visibleRangeMs: TsRange;
  slotVotes: ReadonlyMap<number, SlotVotes>;
  slotInfos: ReadonlyMap<number, SlotInfo>;
  markerStyle: MarkerStyle;
}

export function drawVotes(
  ctx: CanvasRenderingContext2D,
  {
    widthPx,
    heightPx,
    visibleRangeMs,
    slotVotes,
    slotInfos,
    markerStyle,
  }: DrawVotesArgs,
) {
  ctx.clearRect(0, 0, widthPx, heightPx);

  const layout = getVotesPlotLayout(heightPx);
  const [startMs, endMs] = visibleRangeMs;
  const pxPerMs = widthPx / (endMs - startMs);
  const toX = (ms: number) => (ms - startMs) * pxPerMs;
  const toY = (frac: number) => getFracY(layout, frac);
  const notarY = toY(NOTAR_THRESHOLD);
  const fastFinalizeY = toY(FAST_FINALIZE_THRESHOLD);

  drawThresholdLine(ctx, widthPx, notarY);
  drawThresholdLine(ctx, widthPx, fastFinalizeY);

  drawStrip(ctx, layout, widthPx, toX, slotVotes, slotInfos);

  const lines = new Map<VoteLine, Map<string, Path2D>>(
    voteLineDrawOrder.map((line) => [line, new Map()]),
  );
  const markers: Marker[] = [];
  const addMarker = (
    color: string,
    filled: boolean,
    ts: number | undefined,
    y: number,
  ) => {
    if (ts === undefined) return;
    const x = toX(ts);
    if (x < -ICON_RADIUS_PX || x > widthPx + ICON_RADIUS_PX) return;
    markers.push({ x, y, color, filled });
  };

  for (const [slot, votes] of slotVotes) {
    const { certs } = votes;
    const outcome = getSlotOutcome(
      certs,
      slotInfos.get(slot)?.isSkipped ?? false,
    );
    const lineColor = lineColors[outcome];

    const addLine = (
      line: VoteLine,
      curve: StepCurve | null,
      lineMarkers: [
        color: string,
        filled: boolean,
        cert: CertKind,
        y: number,
      ][],
    ) => {
      if (!curve?.ts.length) return;
      const path = getPath(lines.get(line)!, lineColor);
      traceCurve(path, curve, toX, toY, widthPx);
      for (const [color, filled, cert, y] of lineMarkers)
        addMarker(color, filled, certs.get(cert), y);
    };

    addLine("notar", votes.notar, [
      [votesNotarColor, false, CertKind.Notar, notarY],
      [votesFastFinalizeColor, true, CertKind.FastFinalize, fastFinalizeY],
    ]);
    addLine("notarFallback", votes.notarFallback, [
      [votesFastFinalizeColor, false, CertKind.NotarFallback, notarY],
    ]);
    addLine("skip", votes.skipAll, [
      [votesSkippedColor, false, CertKind.Skip, notarY],
    ]);
    addLine("finalize", votes.finalize, [
      [votesFastFinalizeColor, true, CertKind.Finalize, notarY],
    ]);
  }

  ctx.lineWidth = LINE_WIDTH_PX;
  ctx.lineJoin = "round";
  for (const [line, paths] of lines) {
    strokePaths(ctx, paths, voteLineDashes[line]);
  }
  if (markerStyle === "icon") drawIcons(ctx, markers);
  else drawTicks(ctx, markers);
}

function drawIcons(ctx: CanvasRenderingContext2D, markers: Marker[]) {
  ctx.lineWidth = ICON_STROKE_PX;
  ctx.lineCap = "round";
  for (const { x, y, color, filled } of markers) {
    ctx.beginPath();
    ctx.arc(x, y, ICON_RADIUS_PX, 0, 2 * Math.PI);
    ctx.fillStyle = filled ? color : votesIconBackgroundColor;
    ctx.fill();
    if (!filled) {
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    const r = ICON_RADIUS_PX;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y);
    ctx.lineTo(x - r * 0.1, y + r * 0.35);
    ctx.lineTo(x + r * 0.45, y - r * 0.35);
    ctx.strokeStyle = filled ? votesIconBackgroundColor : color;
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawTicks(ctx: CanvasRenderingContext2D, markers: Marker[]) {
  ctx.lineWidth = TICK_WIDTH_PX;
  for (const { x, y, color } of markers) {
    ctx.beginPath();
    ctx.moveTo(x, y - TICK_HALF_HEIGHT_PX);
    ctx.lineTo(x, y + TICK_HALF_HEIGHT_PX);
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

// slot intervals overlap, so each cell cuts a gap at its start
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  { stripTopPx }: VotesPlotLayout,
  widthPx: number,
  toX: (ms: number) => number,
  slotVotes: ReadonlyMap<number, SlotVotes>,
  slotInfos: ReadonlyMap<number, SlotInfo>,
) {
  const visible = [...slotInfos.values()]
    .filter(({ startMs, endMs }) => toX(endMs) >= 0 && toX(startMs) <= widthPx)
    .sort((a, b) => a.startMs - b.startMs);

  for (const info of visible) {
    const x0 = Math.round(toX(info.startMs));
    const x1 = Math.round(toX(info.endMs));
    const outcome = getSlotOutcome(
      slotVotes.get(info.slot)?.certs,
      info.isSkipped,
    );
    ctx.clearRect(
      x0 - STRIP_CELL_GAP_PX,
      stripTopPx,
      STRIP_CELL_GAP_PX,
      STRIP_PX,
    );
    ctx.fillStyle = stripColors[outcome];
    ctx.fillRect(
      x0,
      stripTopPx,
      Math.max(1, x1 - x0 - STRIP_CELL_GAP_PX),
      STRIP_PX,
    );
  }
}

function getPath(paths: Map<string, Path2D>, key: string) {
  let path = paths.get(key);
  if (!path) {
    path = new Path2D();
    paths.set(key, path);
  }
  return path;
}

function strokePaths(
  ctx: CanvasRenderingContext2D,
  paths: Map<string, Path2D>,
  dash: number[],
) {
  ctx.setLineDash(dash);
  for (const [color, path] of paths) {
    ctx.strokeStyle = color;
    ctx.stroke(path);
  }
  ctx.setLineDash([]);
}

function drawThresholdLine(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  y: number,
) {
  ctx.strokeStyle = votesThresholdLineColor;
  ctx.lineWidth = 1;
  ctx.setLineDash(THRESHOLD_DASH);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(y) + 0.5);
  ctx.lineTo(widthPx, Math.round(y) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
}

// at most one point per pixel column
function traceCurve(
  path: Path2D,
  { ts, frac }: StepCurve,
  toX: (ms: number) => number,
  toY: (frac: number) => number,
  widthPx: number,
) {
  const last = ts.length - 1;
  if (last < 0) return;
  const firstX = toX(ts[0]);
  if (toX(ts[last]) < 0 || firstX > widthPx) return;

  path.moveTo(firstX, toY(0));
  let prevX = -Infinity;
  for (let i = 0; i <= last; i++) {
    const x = toX(ts[i]);
    if (x - prevX < 1 && i < last) continue;
    path.lineTo(x, toY(frac[i]));
    prevX = x;
  }
}
