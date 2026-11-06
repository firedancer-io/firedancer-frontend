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

export const MIN_STEP_FRAC = 0.002;

export type VotesView = "curves" | "slotLatency" | "aggLatency";

const CURVES_MAX_RANGE_MS = 40_000;
const SLOT_LATENCY_MAX_RANGE_MS = HEADER_AGG_THRESHOLD_MS;
const ICON_MARKERS_MAX_RANGE_MS = 10_000;

export function getVotesView(spanMs: number): VotesView {
  if (spanMs < CURVES_MAX_RANGE_MS) return "curves";
  if (spanMs < SLOT_LATENCY_MAX_RANGE_MS) return "slotLatency";
  return "aggLatency";
}

export type MarkerStyle = "icon" | "tick";

export function getMarkerStyle(spanMs: number): MarkerStyle {
  return spanMs < ICON_MARKERS_MAX_RANGE_MS ? "icon" : "tick";
}

export const PLOT_BOTTOM_PAD_PX = 4;
export const OWN_VOTE_TRIANGLE_PX = 6;
export const LINE_WIDTH_PX = 1.25;
export const ICON_SIZE_PX = 11;
export const FADED_ALPHA = 0.35;
export const OWN_VOTE_LINE_ALPHA = 0.4;
export const TICK_HALF_HEIGHT_PX = 4;
export const TICK_WIDTH_PX = 2;

export type VoteLine = "notar" | "notarFallback" | "skip" | "finalize";

export const voteLineDashes: Record<VoteLine, number[]> = {
  notar: [],
  notarFallback: [5, 3],
  skip: [],
  finalize: [],
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

const VOTE_GRANULARITY_MAX_MS = 10_000;

export function getVotesGranularity(spanMs: number): VotesGranularity {
  return spanMs < VOTE_GRANULARITY_MAX_MS
    ? VotesGranularityEnum.vote
    : VotesGranularityEnum.vote_batch;
}
