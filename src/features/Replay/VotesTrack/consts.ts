import type { VotesGranularity } from "../../../api/types";
import { VotesGranularityEnum } from "../../../api/entities";
import { HEADER_AGG_THRESHOLD_MS } from "../HeaderTrack/const";
import {
  votesColor,
  votesNotarColor,
  votesSkippedColor,
} from "../../../colors";

export enum VoteKind {
  Notar = 0,
  Finalize = 1,
  Skip = 2,
  NotarFallback = 3,
  SkipFallback = 4,
}
export const VOTE_KIND_COUNT = 5;
export const OWN_VOTE_EVENT_OFFSET = 10;
export const VOTE_BATCH_EVENT_OFFSET = 21;
export const PARENT_READY_EVENT = 20;

export enum CertKind {
  Finalize = 5,
  FastFinalize = 6,
  Notar = 7,
  NotarFallback = 8,
  Skip = 9,
}

export const NOTAR_THRESHOLD = 0.6;
export const FAST_FINALIZE_THRESHOLD = 0.8;
export const THRESHOLD_FRACS = [NOTAR_THRESHOLD, FAST_FINALIZE_THRESHOLD];

// sub-pixel stake steps; bounds points per raw curve for live parsing
export const MIN_STEP_FRAC = 0.002;

export type VotesView = "curves" | "slotLatency" | "aggLatency";

const CURVES_MAX_RANGE_MS = 40_000;
const SLOT_LATENCY_MAX_RANGE_MS = HEADER_AGG_THRESHOLD_MS;
const ICON_MARKERS_MAX_RANGE_MS = 10_000;

export function getVotesView(windowSizeMs: number): VotesView {
  if (windowSizeMs < CURVES_MAX_RANGE_MS) return "curves";
  if (windowSizeMs < SLOT_LATENCY_MAX_RANGE_MS) return "slotLatency";
  return "aggLatency";
}

export type MarkerStyle = "icon" | "tick";

export function getMarkerStyle(windowSizeMs: number): MarkerStyle {
  return windowSizeMs < ICON_MARKERS_MAX_RANGE_MS ? "icon" : "tick";
}

export const PLOT_BOTTOM_PAD_PX = 4;
export const OWN_VOTE_TRIANGLE_PX = 6;
export const LINE_WIDTH_PX = 1.25;
export const ICON_SIZE_PX = 11;
export const FADED_ALPHA = 0.35;
export const OWN_VOTE_LINE_ALPHA = 0.4;
export const TICK_HALF_HEIGHT_PX = 4;
export const TICK_WIDTH_PX = 2;
export const THRESHOLD_LINE_ALPHA = 0.22;
export const DASH_PERIOD_PX = 8;
export const GUIDE_DASH_PX = 4;

export type VoteLine = "notar" | "notarFallback" | "skip" | "finalize";

// dash length in each DASH_PERIOD_PX, 0 for solid
export const voteLineDashPx: Record<VoteLine, number> = {
  notar: 0,
  notarFallback: 5,
  skip: 0,
  finalize: 0,
};

export const voteLineColors: Record<VoteLine, string> = {
  notar: votesNotarColor,
  notarFallback: votesNotarColor,
  skip: votesSkippedColor,
  finalize: votesColor,
};

export const lineCertKinds: Record<VoteLine, CertKind[]> = {
  notar: [CertKind.Notar, CertKind.FastFinalize],
  notarFallback: [CertKind.NotarFallback],
  skip: [CertKind.Skip],
  finalize: [CertKind.Finalize],
};

// back to front
export const voteLineDrawOrder: VoteLine[] = [
  "finalize",
  "skip",
  "notarFallback",
  "notar",
];

export const VOTES_TILE_NS: Record<VotesGranularity, bigint> = {
  vote: 4_000_000_000n, // 4s
  vote_batch: 32_000_000_000n, // 32s
};

const VOTE_GRANULARITY_MAX_MS = 10_000;

export function getVotesGranularity(windowSizeMs: number): VotesGranularity {
  return windowSizeMs < VOTE_GRANULARITY_MAX_MS
    ? VotesGranularityEnum.vote
    : VotesGranularityEnum.vote_batch;
}
