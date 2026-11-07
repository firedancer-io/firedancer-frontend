import {
  votesFastFinalizeColor,
  votesNotarColor,
  votesSkippedColor,
  votesThresholdLineColor,
} from "../../../colors";
import notarizedIconSrc from "../../../assets/notarized.svg";
import notarizedSkippedIconSrc from "../../../assets/notarized_skipped.svg";
import finalizedIconSrc from "../../../assets/finalized.svg";
import type { TsRange } from "../../WebGl/webglUtils";
import { trackInsetPx } from "../layout";
import {
  CertKind,
  FADED_ALPHA,
  ICON_SIZE_PX,
  TICK_HALF_HEIGHT_PX,
  TICK_WIDTH_PX,
  FAST_FINALIZE_THRESHOLD,
  LINE_WIDTH_PX,
  NOTAR_THRESHOLD,
  OWN_VOTE_LINE_ALPHA,
  OWN_VOTE_TRIANGLE_PX,
  PLOT_BOTTOM_PAD_PX,
  VoteKind,
  lineCertKinds,
  voteLineColors,
  voteLineDashes,
  voteLineDrawOrder,
  type MarkerStyle,
  type VoteLine,
} from "./consts";
import { getFadeTs, type SlotVotes, type StepCurve } from "./votesData";

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

interface VotesPlotLayout {
  topPx: number;
  bottomPx: number;
}

export function getVotesPlotLayout(heightPx: number): VotesPlotLayout {
  return {
    topPx: trackInsetPx.votes,
    bottomPx: heightPx - PLOT_BOTTOM_PAD_PX,
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
  isFaded: boolean;
}

interface DrawVotesArgs {
  widthPx: number;
  heightPx: number;
  visibleRangeMs: TsRange;
  slotVotes: ReadonlyMap<number, SlotVotes>;
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
    markerStyle,
    certIcons,
  }: DrawVotesArgs,
) {
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

  if (markerStyle === "icon") {
    drawOwnVotes(ctx, layout, widthPx, toX, slotVotes);
  }

  const paths = createLinePaths();
  const fadedPaths = createLinePaths();
  const markers: Marker[] = [];

  for (const votes of slotVotes.values()) {
    const { certs } = votes;
    const fadeTs = getFadeTs(certs);

    for (const line of voteLineDrawOrder) {
      const curve = votes[lineCurveKeys[line]];
      if (!curve?.ts.length) continue;

      for (const cert of lineCertKinds[line]) {
        const ts = certs.get(cert);
        if (ts === undefined) continue;
        const x = toX(ts);
        if (x < -ICON_SIZE_PX || x > widthPx + ICON_SIZE_PX) continue;
        const y = cert === CertKind.FastFinalize ? fastFinalizeY : notarY;
        markers.push({
          x,
          y,
          icon: certIconByKind[cert],
          isFaded: fadeTs !== undefined && ts > fadeTs,
        });
      }

      traceCurve(
        paths[line],
        fadedPaths[line],
        curve,
        fadeTs,
        toX,
        toY,
        widthPx,
      );
    }
  }

  ctx.lineWidth = LINE_WIDTH_PX;
  ctx.lineJoin = "round";
  ctx.globalAlpha = FADED_ALPHA;
  for (const line of voteLineDrawOrder) strokeLine(ctx, fadedPaths[line], line);
  ctx.globalAlpha = 1;
  for (const line of voteLineDrawOrder) strokeLine(ctx, paths[line], line);

  if (markerStyle === "icon" && certIcons) drawIcons(ctx, markers, certIcons);
  else drawTicks(ctx, markers);
}

function drawIcons(
  ctx: CanvasRenderingContext2D,
  markers: Marker[],
  certIcons: CertIcons,
) {
  for (const { x, y, icon, isFaded } of markers) {
    ctx.globalAlpha = isFaded ? FADED_ALPHA : 1;
    const image = certIcons[icon];
    const scale =
      ICON_SIZE_PX / Math.max(image.naturalWidth, image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
  }
  ctx.globalAlpha = 1;
}

function drawTicks(ctx: CanvasRenderingContext2D, markers: Marker[]) {
  ctx.lineWidth = TICK_WIDTH_PX;
  for (const { x, y, icon, isFaded } of markers) {
    ctx.globalAlpha = isFaded ? FADED_ALPHA : 1;
    ctx.beginPath();
    ctx.moveTo(x, y - TICK_HALF_HEIGHT_PX);
    ctx.lineTo(x, y + TICK_HALF_HEIGHT_PX);
    ctx.strokeStyle = certTickColors[icon];
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const ownVoteColors: [VoteKind, string][] = [
  [VoteKind.Notar, voteLineColors.notar],
  [VoteKind.Finalize, voteLineColors.finalize],
];

function drawOwnVotes(
  ctx: CanvasRenderingContext2D,
  { topPx, bottomPx }: VotesPlotLayout,
  widthPx: number,
  toX: (ms: number) => number,
  slotVotes: ReadonlyMap<number, SlotVotes>,
) {
  const halfPx = OWN_VOTE_TRIANGLE_PX / 2;
  ctx.lineWidth = 1;
  for (const [kind, color] of ownVoteColors) {
    const lines = new Path2D();
    const triangles = new Path2D();
    for (const { ownVotes } of slotVotes.values()) {
      const ts = ownVotes.get(kind);
      if (ts === undefined) continue;
      const x = Math.round(toX(ts)) + 0.5;
      if (x < -halfPx || x > widthPx + halfPx) continue;
      lines.moveTo(x, topPx);
      lines.lineTo(x, bottomPx);
      triangles.moveTo(x - halfPx, topPx - OWN_VOTE_TRIANGLE_PX);
      triangles.lineTo(x + halfPx, topPx - OWN_VOTE_TRIANGLE_PX);
      triangles.lineTo(x, topPx);
      triangles.closePath();
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = OWN_VOTE_LINE_ALPHA;
    ctx.stroke(lines);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fill(triangles);
  }
}

const lineCurveKeys = {
  notar: "notar",
  notarFallback: "notarFallback",
  skip: "skipAll",
  finalize: "finalize",
} as const satisfies Record<VoteLine, keyof SlotVotes>;

function createLinePaths(): Record<VoteLine, Path2D> {
  return {
    notar: new Path2D(),
    notarFallback: new Path2D(),
    skip: new Path2D(),
    finalize: new Path2D(),
  };
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  line: VoteLine,
) {
  ctx.setLineDash(voteLineDashes[line]);
  ctx.strokeStyle = voteLineColors[line];
  ctx.stroke(path);
  ctx.setLineDash([]);
}

export function drawThresholdLine(
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

// at most one point per pixel column, keeping the last one before a gap
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

  let target = fadeTs !== undefined && ts[0] > fadeTs ? fadedPath : path;
  let prevX = firstX;
  let prevY = toY(0);
  target.moveTo(prevX, prevY);
  for (let i = 0; i <= last; i++) {
    const x = toX(ts[i]);
    const y = toY(frac[i]);
    if (target === path && fadeTs !== undefined && ts[i] > fadeTs) {
      // split exactly at the fade, from the true neighbors rather than kept points
      const t = (fadeTs - ts[i - 1]) / (ts[i] - ts[i - 1]);
      prevX = toX(fadeTs);
      prevY = toY(frac[i - 1] + t * (frac[i] - frac[i - 1]));
      path.lineTo(prevX, prevY);
      target = fadedPath;
      target.moveTo(prevX, prevY);
    }
    if (i > 0 && i < last && toX(ts[i + 1]) - prevX < 1) continue;
    prevX = x;
    prevY = y;
    target.lineTo(prevX, prevY);
  }
}
