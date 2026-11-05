import type { VotesGranularity } from "../../../api/types";
import { VotesGranularityEnum } from "../../../api/entities";
import { HEADER_AGG_THRESHOLD_MS } from "../HeaderTrack/const";

export enum VoteKind {
  Notar = 0,
  Finalize = 1,
  Skip = 2,
  NotarFallback = 3,
  SkipFallback = 4,
}
export const VOTE_KIND_COUNT = 5;
export const VOTE_BATCH_EVENT_OFFSET = 21;
export const PARENT_READY_EVENT = 20;

export enum CertKind {
  Finalize = 5,
  FastFinalize = 6,
  Notar = 7,
  NotarFallback = 8,
  Skip = 9,
}

export type SlotOutcome = "fast" | "slow" | "implicit" | "skipped";

export const NOTAR_THRESHOLD = 0.6;
export const FAST_FINALIZE_THRESHOLD = 0.8;

export const MIN_STEP_FRAC = 0.002;

export type VotesView = "curves" | "slotLatency" | "aggLatency";

const CURVES_MAX_RANGE_MS = 40_000;
/** The slot strip comes from the header's non-agg slots query */
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

export const STRIP_PX = 6;
export const STRIP_GAP_PX = 4;
export const STRIP_CELL_GAP_PX = 2;
export const LINE_WIDTH_PX = 1.25;
export const DOT_RADIUS_PX = 3;
export const ICON_RADIUS_PX = 5;
export const ICON_STROKE_PX = 1.25;
export const TICK_HALF_HEIGHT_PX = 4;
export const TICK_WIDTH_PX = 2;

export type VoteLine = "notar" | "notarFallback" | "skip" | "finalize";

export const voteLineDashes: Record<VoteLine, number[]> = {
  notar: [],
  notarFallback: [5, 3],
  skip: [8, 3, 2, 3],
  finalize: [2, 3],
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
