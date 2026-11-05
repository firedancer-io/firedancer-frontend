import {
  votesImplicitColor,
  votesFastFinalizeColor,
  votesNotarColor,
  votesSkippedColor,
  votesSlowColor,
  votesStripFastColor,
  votesStripImplicitColor,
  votesStripSlowColor,
  votesStripSkippedColor,
  votesThresholdLineColor,
} from "../../../colors";
import notarizedIconSrc from "../../../assets/notarized.svg";
import notarizedSkippedIconSrc from "../../../assets/notarized_skipped.svg";
import finalizedIconSrc from "../../../assets/finalized.svg";
import type { TsRange } from "../../WebGl/webglUtils";
import type { SlotInfo } from "../HeaderTrack/nonAggAtoms";
import { trackInsetPx } from "../layout";
import {
  CertKind,
  FADED_LINE_ALPHA,
  ICON_SIZE_PX,
  TICK_HALF_HEIGHT_PX,
  TICK_WIDTH_PX,
  FAST_FINALIZE_THRESHOLD,
  LINE_WIDTH_PX,
  NOTAR_THRESHOLD,
  STRIP_CELL_GAP_PX,
  STRIP_GAP_PX,
  STRIP_PX,
  lineCertKinds,
  voteLineDashes,
  voteLineDrawOrder,
  type MarkerStyle,
  type SlotOutcome,
  type VoteLine,
} from "./consts";
import {
  getLineFadeTs,
  getSlotOutcome,
  type SlotVotes,
  type StepCurve,
} from "./votesData";

const GUIDE_DASH = [4, 4];
const GUIDE_DASH_PERIOD_PX = GUIDE_DASH[0] + GUIDE_DASH[1];

// dashes move with the timeline instead of the screen
function getGuideDashOffset(startMs: number, pxPerMs: number) {
  return (startMs * pxPerMs) % GUIDE_DASH_PERIOD_PX;
}

export function setGuideDash(
  ctx: CanvasRenderingContext2D,
  startMs: number,
  pxPerMs: number,
) {
  ctx.setLineDash(GUIDE_DASH);
  ctx.lineDashOffset = getGuideDashOffset(startMs, pxPerMs);
}

export function clearDash(ctx: CanvasRenderingContext2D) {
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

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

type CertIcon = "notarized" | "finalized" | "skipNotarized";
export type CertIcons = Record<CertIcon, HTMLImageElement>;

const certIconSrcs: Record<CertIcon, string> = {
  notarized: notarizedIconSrc,
  finalized: finalizedIconSrc,
  skipNotarized: notarizedSkippedIconSrc,
};

const certTickColors: Record<CertIcon, string> = {
  notarized: votesNotarColor,
  finalized: votesFastFinalizeColor,
  skipNotarized: votesSkippedColor,
};

export async function loadCertIcons(): Promise<CertIcons> {
  const entries = await Promise.all(
    Object.entries(certIconSrcs).map(async ([icon, src]) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return [icon, image] as const;
    }),
  );
  return Object.fromEntries(entries) as CertIcons;
}

const certIconByKind: Record<CertKind, CertIcon> = {
  [CertKind.Notar]: "notarized",
  [CertKind.NotarFallback]: "notarized",
  [CertKind.FastFinalize]: "finalized",
  [CertKind.Finalize]: "finalized",
  [CertKind.Skip]: "skipNotarized",
};

interface Marker {
  x: number;
  y: number;
  icon: CertIcon;
}

interface DrawVotesArgs {
  widthPx: number;
  heightPx: number;
  visibleRangeMs: TsRange;
  slotVotes: ReadonlyMap<number, SlotVotes>;
  slotInfos: ReadonlyMap<number, SlotInfo>;
  markerStyle: MarkerStyle;
  certIcons: CertIcons | undefined;
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
    certIcons,
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

  setGuideDash(ctx, startMs, pxPerMs);
  drawThresholdLine(ctx, widthPx, notarY);
  drawThresholdLine(ctx, widthPx, fastFinalizeY);
  clearDash(ctx);

  drawStrip(ctx, layout, widthPx, toX, slotVotes, slotInfos);

  const lines = new Map<VoteLine, Map<string, Path2D>>(
    voteLineDrawOrder.map((line) => [line, new Map()]),
  );
  const fadedLines = new Map<VoteLine, Map<string, Path2D>>(
    voteLineDrawOrder.map((line) => [line, new Map()]),
  );
  const markers: Marker[] = [];

  for (const [slot, votes] of slotVotes) {
    const { certs } = votes;
    const outcome = getSlotOutcome(
      certs,
      slotInfos.get(slot)?.isSkipped ?? false,
    );
    const lineColor = lineColors[outcome];

    const curves: Record<VoteLine, StepCurve | null> = {
      notar: votes.notar,
      notarFallback: votes.notarFallback,
      skip: votes.skipAll,
      finalize: votes.finalize,
    };
    for (const line of voteLineDrawOrder) {
      const curve = curves[line];
      if (!curve?.ts.length) continue;

      for (const cert of lineCertKinds[line]) {
        const ts = certs.get(cert);
        if (ts === undefined) continue;
        const x = toX(ts);
        if (x < -ICON_SIZE_PX || x > widthPx + ICON_SIZE_PX) continue;
        const y = cert === CertKind.FastFinalize ? fastFinalizeY : notarY;
        markers.push({ x, y, icon: certIconByKind[cert] });
      }

      traceCurve(
        getPath(lines.get(line)!, lineColor),
        getPath(fadedLines.get(line)!, lineColor),
        curve,
        getLineFadeTs(line, certs),
        toX,
        toY,
        widthPx,
      );
    }
  }

  ctx.lineWidth = LINE_WIDTH_PX;
  ctx.lineJoin = "round";
  ctx.globalAlpha = FADED_LINE_ALPHA;
  for (const [line, paths] of fadedLines) {
    strokePaths(ctx, paths, voteLineDashes[line]);
  }
  ctx.globalAlpha = 1;
  for (const [line, paths] of lines) {
    strokePaths(ctx, paths, voteLineDashes[line]);
  }

  if (markerStyle === "icon" && certIcons) drawIcons(ctx, markers, certIcons);
  else drawTicks(ctx, markers);
}

function drawIcons(
  ctx: CanvasRenderingContext2D,
  markers: Marker[],
  certIcons: CertIcons,
) {
  for (const { x, y, icon } of markers) {
    const image = certIcons[icon];
    const scale =
      ICON_SIZE_PX / Math.max(image.naturalWidth, image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
  }
}

function drawTicks(ctx: CanvasRenderingContext2D, markers: Marker[]) {
  ctx.lineWidth = TICK_WIDTH_PX;
  for (const { x, y, icon } of markers) {
    ctx.beginPath();
    ctx.moveTo(x, y - TICK_HALF_HEIGHT_PX);
    ctx.lineTo(x, y + TICK_HALF_HEIGHT_PX);
    ctx.strokeStyle = certTickColors[icon];
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
  ctx.beginPath();
  ctx.moveTo(0, Math.round(y) + 0.5);
  ctx.lineTo(widthPx, Math.round(y) + 0.5);
  ctx.stroke();
}

// at most one point per pixel column
function traceCurve(
  path: Path2D,
  fadedPath: Path2D,
  { ts, frac }: StepCurve,
  fadeTs: number | undefined,
  toX: (ms: number) => number,
  toY: (frac: number) => number,
  widthPx: number,
) {
  const last = ts.length - 1;
  if (last < 0) return;
  const firstX = toX(ts[0]);
  if (toX(ts[last]) < 0 || firstX > widthPx) return;

  let target = path;
  let prevX = firstX;
  let prevY = toY(0);
  path.moveTo(prevX, prevY);
  for (let i = 0; i <= last; i++) {
    if (target === path && fadeTs !== undefined && ts[i] > fadeTs) {
      target = fadedPath;
      target.moveTo(prevX, prevY);
    }
    const x = toX(ts[i]);
    if (x - prevX < 1 && i > 0 && i < last) continue;
    prevX = x;
    prevY = toY(frac[i]);
    target.lineTo(prevX, prevY);
  }
}
