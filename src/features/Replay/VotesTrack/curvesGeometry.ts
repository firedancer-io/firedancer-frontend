import {
  votesFastFinalizeColor,
  votesNotarColor,
  votesSkippedColor,
} from "../../../colors";
import notarizedIconSrc from "../../../assets/notarized.svg";
import notarizedSkippedIconSrc from "../../../assets/notarized_skipped.svg";
import finalizedIconSrc from "../../../assets/finalized.svg";
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
  THRESHOLD_FRACS,
  OWN_VOTE_LINE_ALPHA,
  OWN_VOTE_TRIANGLE_PX,
  PLOT_BOTTOM_PAD_PX,
  VoteKind,
  lineCertKinds,
  voteLineColors,
  voteLineDashPx,
  voteLineDrawOrder,
  type MarkerStyle,
  type VoteLine,
} from "./consts";
import { getFadeTs, type SlotVotes, type StepCurve } from "./votesData";

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

export const certIconOrder = [
  "notarized",
  "finalized",
  "skipNotarized",
] as const;
export type CertIcon = (typeof certIconOrder)[number];

export interface Stroke {
  color: string;
  alpha: number;
  widthPx: number;
  dashPx: number;
  // x0, y0, x1, y1 per segment, in ms and px from the top
  segments: number[];
}

export type Marker = {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  alpha: number;
} & ({ color: string } | { icon: CertIcon });

export interface VotesGeometry {
  strokes: Stroke[];
  markers: Marker[];
  triangles: Marker[];
}
export type CertIcons = Record<
  CertIcon,
  Pick<HTMLImageElement, "naturalWidth" | "naturalHeight">
>;

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

export async function loadCertIcons() {
  const entries = await Promise.all(
    Object.entries(certIconSrcs).map(async ([icon, src]) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return [icon, image] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<CertIcon, HTMLImageElement>;
}

export function getIconSizePx({
  naturalWidth,
  naturalHeight,
}: CertIcons[CertIcon]) {
  const scale = ICON_SIZE_PX / Math.max(naturalWidth, naturalHeight);
  return { widthPx: naturalWidth * scale, heightPx: naturalHeight * scale };
}

const certIconByKind: Record<CertKind, CertIcon> = {
  [CertKind.Notar]: "notarized",
  [CertKind.NotarFallback]: "notarized",
  [CertKind.FastFinalize]: "finalized",
  [CertKind.Finalize]: "finalized",
  [CertKind.Skip]: "skipNotarized",
};

const lineCurveKeys = {
  notar: "notar",
  notarFallback: "notarFallback",
  skip: "skipAll",
  finalize: "finalize",
} as const satisfies Record<VoteLine, keyof SlotVotes>;

function createLineStrokes(alpha: number): Record<VoteLine, Stroke> {
  const stroke = (line: VoteLine): Stroke => ({
    color: voteLineColors[line],
    alpha,
    widthPx: LINE_WIDTH_PX,
    dashPx: voteLineDashPx[line],
    segments: [],
  });
  return {
    notar: stroke("notar"),
    notarFallback: stroke("notarFallback"),
    skip: stroke("skip"),
    finalize: stroke("finalize"),
  };
}

export function getThresholdYs(heightPx: number) {
  const layout = getVotesPlotLayout(heightPx);
  return THRESHOLD_FRACS.map((frac) => getFracY(layout, frac));
}

interface BuildVotesArgs {
  heightPx: number;
  slotVotes: SlotVotes[];
  markerStyle: MarkerStyle;
  certIcons: CertIcons | undefined;
}

export function buildVotes({
  heightPx,
  slotVotes,
  markerStyle,
  certIcons,
}: BuildVotesArgs): VotesGeometry {
  const layout = getVotesPlotLayout(heightPx);
  const toY = (frac: number) => getFracY(layout, frac);
  const notarY = toY(NOTAR_THRESHOLD);
  const fastFinalizeY = toY(FAST_FINALIZE_THRESHOLD);

  const solid = createLineStrokes(1);
  const faded = createLineStrokes(FADED_ALPHA);
  const markers: Marker[] = [];
  for (const votes of slotVotes) {
    const { certs } = votes;
    const fadeTs = getFadeTs(certs);

    for (const line of voteLineDrawOrder) {
      const curve = votes[lineCurveKeys[line]];
      if (!curve?.ts.length) continue;

      for (const cert of lineCertKinds[line]) {
        const ts = certs.get(cert);
        if (ts === undefined) continue;
        const icon = certIconByKind[cert];
        const position = {
          x: ts,
          y: cert === CertKind.FastFinalize ? fastFinalizeY : notarY,
          alpha: fadeTs !== undefined && ts > fadeTs ? FADED_ALPHA : 1,
        };
        markers.push(
          markerStyle === "icon" && certIcons
            ? { ...position, ...getIconSizePx(certIcons[icon]), icon }
            : {
                ...position,
                widthPx: TICK_WIDTH_PX,
                heightPx: TICK_HALF_HEIGHT_PX * 2,
                color: certTickColors[icon],
              },
        );
      }

      traceCurve(solid[line], faded[line], curve, fadeTs, toY);
    }
  }

  const ownVotes =
    markerStyle === "icon"
      ? getOwnVotes(layout, slotVotes)
      : { strokes: [], triangles: [] };

  return {
    strokes: [
      ...ownVotes.strokes,
      ...voteLineDrawOrder.map((line) => faded[line]),
      ...voteLineDrawOrder.map((line) => solid[line]),
    ],
    markers,
    triangles: ownVotes.triangles,
  };
}

const ownVoteColors: [VoteKind, string][] = [
  [VoteKind.Notar, voteLineColors.notar],
  [VoteKind.Finalize, voteLineColors.finalize],
];

function getOwnVotes(
  { topPx, bottomPx }: VotesPlotLayout,
  slotVotes: SlotVotes[],
) {
  const strokes: Stroke[] = [];
  const triangles: Marker[] = [];
  for (const [kind, color] of ownVoteColors) {
    const segments: number[] = [];
    for (const { ownVotes } of slotVotes) {
      const ts = ownVotes.get(kind);
      if (ts === undefined) continue;
      segments.push(ts, topPx, ts, bottomPx);
      triangles.push({
        x: ts,
        y: topPx - OWN_VOTE_TRIANGLE_PX / 2,
        widthPx: OWN_VOTE_TRIANGLE_PX,
        heightPx: OWN_VOTE_TRIANGLE_PX,
        alpha: 1,
        color,
      });
    }
    strokes.push({
      color,
      alpha: OWN_VOTE_LINE_ALPHA,
      widthPx: 1,
      dashPx: 0,
      segments,
    });
  }
  return { strokes, triangles };
}

// from (ts[0], 0) through the points, split exactly at the fade
function traceCurve(
  solid: Stroke,
  faded: Stroke,
  { ts, frac }: StepCurve,
  fadeTs: number | undefined,
  toY: (frac: number) => number,
) {
  let target = fadeTs !== undefined && ts[0] > fadeTs ? faded : solid;
  let prevX = ts[0];
  let prevY = toY(0);
  for (let i = 0; i < ts.length; i++) {
    const x = ts[i];
    const y = toY(frac[i]);
    if (target === solid && fadeTs !== undefined && x > fadeTs) {
      const t = (fadeTs - ts[i - 1]) / (x - ts[i - 1]);
      const fadeY = toY(frac[i - 1] + t * (frac[i] - frac[i - 1]));
      solid.segments.push(prevX, prevY, fadeTs, fadeY);
      prevX = fadeTs;
      prevY = fadeY;
      target = faded;
    }
    target.segments.push(prevX, prevY, x, y);
    prevX = x;
    prevY = y;
  }
}
