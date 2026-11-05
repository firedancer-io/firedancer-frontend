import type { TimelineVotes } from "../../../api/types";
import { VotesGranularityEnum } from "../../../api/entities";
import { calcRelativeMs } from "../utils";
import {
  CertKind,
  MIN_STEP_FRAC,
  PARENT_READY_EVENT,
  VOTE_BATCH_EVENT_OFFSET,
  VOTE_KIND_COUNT,
  VoteKind,
  type SlotOutcome,
} from "./consts";

export interface StepCurve {
  ts: number[];
  frac: number[];
}

interface SlotPartial {
  curves: StepCurve[];
  certs: Map<CertKind, number>;
  // set on a leader window's first slot
  parentReadyTs: number | undefined;
}

export type VotesData = Map<number, SlotPartial>;

export interface SlotVotes {
  notar: StepCurve;
  // null without notar fallback votes
  notarFallback: StepCurve | null;
  finalize: StepCurve;
  skipAll: StepCurve;
  certs: Map<CertKind, number>;
  parentReadyTs: number | undefined;
}

function emptyCurve(): StepCurve {
  return { ts: [], frac: [] };
}

function emptyPartial(): SlotPartial {
  return {
    curves: Array.from({ length: VOTE_KIND_COUNT }, emptyCurve),
    certs: new Map(),
    parentReadyTs: undefined,
  };
}

function toVoteKind(event: number) {
  return event >= VOTE_BATCH_EVENT_OFFSET &&
    event < VOTE_BATCH_EVENT_OFFSET + VOTE_KIND_COUNT
    ? event - VOTE_BATCH_EVENT_OFFSET
    : event;
}

function isCertKind(event: number): event is CertKind {
  return event >= CertKind.Finalize && event <= CertKind.Skip;
}

interface SlotAccumulator {
  partial: SlotPartial;
  total: number;
  sums: Float64Array;
  keptSums: Float64Array;
  lastTs: Float64Array;
}

function keepPoint(acc: SlotAccumulator, kind: VoteKind) {
  const curve = acc.partial.curves[kind];
  curve.ts.push(acc.lastTs[kind]);
  curve.frac.push(acc.sums[kind] / acc.total);
  acc.keptSums[kind] = acc.sums[kind];
}

export function parseVotes(res: TimelineVotes, referenceNs: bigint): VotesData {
  const data: VotesData = new Map();
  if (res.reference_slot == null || res.reference_ts == null) return data;

  const totalStake = Number(res.total_stake ?? 0n);
  const nextTotalStake = Number(res.next_total_stake ?? 0n);
  const nextEpochStartSlot = res.next_epoch_start_slot ?? Infinity;
  const accs = new Map<number, SlotAccumulator>();
  // batches are already simplified
  const minStepFrac =
    res.granularity === VotesGranularityEnum.vote_batch ? 0 : MIN_STEP_FRAC;

  for (let i = 0; i < res.event.length; i++) {
    const event = toVoteKind(res.event[i]);
    const isVote = event < VOTE_KIND_COUNT;
    const isParentReady = event === PARENT_READY_EVENT;
    if (!isVote && !isParentReady && !isCertKind(event)) continue;

    const slot = res.reference_slot + res.slot_delta[i];
    const ts = calcRelativeMs(
      referenceNs,
      res.reference_ts + res.event_ts_delta[i],
    );

    let acc = accs.get(slot);
    if (!acc) {
      acc = {
        partial: emptyPartial(),
        total: slot >= nextEpochStartSlot ? nextTotalStake : totalStake,
        sums: new Float64Array(VOTE_KIND_COUNT),
        keptSums: new Float64Array(VOTE_KIND_COUNT),
        lastTs: new Float64Array(VOTE_KIND_COUNT),
      };
      accs.set(slot, acc);
      data.set(slot, acc.partial);
    }

    if (isParentReady) {
      acc.partial.parentReadyTs = minTs(acc.partial.parentReadyTs, ts);
      continue;
    }
    if (!isVote) {
      const prev = acc.partial.certs.get(event);
      if (prev === undefined || ts < prev) acc.partial.certs.set(event, ts);
      continue;
    }
    if (acc.total <= 0) continue;

    acc.sums[event] += Number(res.stake[i] ?? 0n);
    acc.lastTs[event] = ts;
    if ((acc.sums[event] - acc.keptSums[event]) / acc.total >= minStepFrac) {
      keepPoint(acc, event);
    }
  }

  // keep each curve's final point
  for (const acc of accs.values()) {
    for (let kind = 0; kind < VOTE_KIND_COUNT; kind++) {
      if (acc.sums[kind] > acc.keptSums[kind]) keepPoint(acc, kind);
    }
  }

  return data;
}

export function hasVotesWithoutTotalStake(res: TimelineVotes) {
  return (
    res.total_stake == null &&
    res.event.some((event) => toVoteKind(event) < VOTE_KIND_COUNT)
  );
}

export function sumCurves(a: StepCurve, b: StepCurve): StepCurve {
  if (!a.ts.length) return b;
  if (!b.ts.length) return a;

  const out = emptyCurve();
  let i = 0;
  let j = 0;
  let aFrac = 0;
  let bFrac = 0;
  while (i < a.ts.length || j < b.ts.length) {
    const ts = Math.min(a.ts[i] ?? Infinity, b.ts[j] ?? Infinity);
    while (i < a.ts.length && a.ts[i] === ts) aFrac = a.frac[i++];
    while (j < b.ts.length && b.ts[j] === ts) bFrac = b.frac[j++];
    out.ts.push(ts);
    out.frac.push(aFrac + bFrac);
  }
  return out;
}

export function mergeVotesData(acc: VotesData, add: VotesData): void {
  for (const [slot, partial] of add) {
    const existing = acc.get(slot);
    if (!existing) {
      acc.set(slot, partial);
      continue;
    }
    for (let kind = 0; kind < VOTE_KIND_COUNT; kind++) {
      existing.curves[kind] = sumCurves(
        existing.curves[kind],
        partial.curves[kind],
      );
    }
    existing.parentReadyTs = minTs(
      existing.parentReadyTs,
      partial.parentReadyTs,
    );
    for (const [cert, ts] of partial.certs) {
      const prev = existing.certs.get(cert);
      if (prev === undefined || ts < prev) existing.certs.set(cert, ts);
    }
  }
}

export function countPoints(data: VotesData): number {
  let count = 0;
  for (const { curves } of data.values()) {
    for (const curve of curves) count += curve.ts.length;
  }
  return count;
}

export function buildSlotVotes(tiles: VotesData[]): Map<number, SlotVotes> {
  const merged: VotesData = new Map();
  for (const tile of tiles) {
    for (const [slot, partial] of tile) {
      // copy so merging never mutates cached tiles
      mergeVotesData(merged, new Map([[slot, copyPartial(partial)]]));
    }
  }

  const slotVotes = new Map<number, SlotVotes>();
  for (const [slot, { curves, certs, parentReadyTs }] of merged) {
    slotVotes.set(slot, {
      notar: curves[VoteKind.Notar],
      notarFallback: curves[VoteKind.NotarFallback].ts.length
        ? sumCurves(curves[VoteKind.Notar], curves[VoteKind.NotarFallback])
        : null,
      finalize: curves[VoteKind.Finalize],
      skipAll: sumCurves(curves[VoteKind.Skip], curves[VoteKind.SkipFallback]),
      certs,
      parentReadyTs,
    });
  }
  return slotVotes;
}

function copyPartial({
  curves,
  certs,
  parentReadyTs,
}: SlotPartial): SlotPartial {
  return { curves: [...curves], certs: new Map(certs), parentReadyTs };
}

function minTs(a: number | undefined, b: number | undefined) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

export function getSlotOutcome(
  certs: ReadonlyMap<CertKind, number> | undefined,
  isSkipped: boolean,
): SlotOutcome {
  if (isSkipped) return "skipped";
  if (certs?.has(CertKind.FastFinalize)) return "fast";
  if (certs?.has(CertKind.Finalize)) return "slow";
  const isNotarized =
    certs?.has(CertKind.Notar) || certs?.has(CertKind.NotarFallback);
  if (certs?.has(CertKind.Skip) && !isNotarized) return "skipped";
  return "implicit";
}
