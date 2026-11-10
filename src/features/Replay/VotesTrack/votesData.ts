import type { TimelineVotes } from "../../../api/types";
import { VotesGranularityEnum } from "../../../api/entities";
import { calcRelativeMs } from "../utils";
import {
  CertKind,
  MIN_STEP_FRAC,
  OWN_VOTE_EVENT_OFFSET,
  PARENT_READY_EVENT,
  VOTE_BATCH_EVENT_OFFSET,
  VOTE_KIND_COUNT,
  VoteKind,
} from "./consts";

export interface StepCurve {
  ts: number[];
  frac: number[];
}

interface SlotPartial {
  curves: StepCurve[];
  certs: Map<CertKind, number>;
  ownVotes: Map<VoteKind, number>;
  // set on a leader window's first slot
  parentReadyTs: number | undefined;
}

export type VotesData = Map<number, SlotPartial>;

export interface VotesDataTile {
  startNs: bigint;
  data: VotesData;
}

export interface SlotVotes {
  slot: number;
  notar: StepCurve;
  // null without notar fallback votes
  notarFallback: StepCurve | null;
  finalize: StepCurve;
  skipAll: StepCurve;
  certs: Map<CertKind, number>;
  ownVotes: Map<VoteKind, number>;
  parentReadyTs: number | undefined;
}

function emptyCurve(): StepCurve {
  return { ts: [], frac: [] };
}

function emptyPartial(): SlotPartial {
  return {
    curves: Array.from({ length: VOTE_KIND_COUNT }, emptyCurve),
    certs: new Map(),
    ownVotes: new Map(),
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
    const ownVoteKind = getOwnVoteKind(event);
    if (
      !isVote &&
      !isParentReady &&
      ownVoteKind === undefined &&
      !isCertKind(event)
    ) {
      continue;
    }

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
    if (ownVoteKind !== undefined) {
      setEarliest(acc.partial.ownVotes, ownVoteKind, ts);
      continue;
    }
    if (!isVote) {
      setEarliest(acc.partial.certs, event, ts);
      continue;
    }
    if (acc.total <= 0) continue;

    acc.sums[event] += Number(res.stake[i]);
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
    if (existing) mergePartial(existing, partial);
    else acc.set(slot, partial);
  }
}

function mergePartial(existing: SlotPartial, partial: SlotPartial) {
  for (let kind = 0; kind < VOTE_KIND_COUNT; kind++) {
    existing.curves[kind] = sumCurves(
      existing.curves[kind],
      partial.curves[kind],
    );
  }
  existing.parentReadyTs = minTs(existing.parentReadyTs, partial.parentReadyTs);
  for (const [cert, ts] of partial.certs) {
    setEarliest(existing.certs, cert, ts);
  }
  for (const [kind, ts] of partial.ownVotes) {
    setEarliest(existing.ownVotes, kind, ts);
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
      const existing = merged.get(slot);
      if (existing) mergePartial(existing, partial);
      // copy so merging never mutates cached tiles
      else merged.set(slot, copyPartial(partial));
    }
  }

  const slotVotes = new Map<number, SlotVotes>();
  for (const [slot, { curves, certs, ownVotes, parentReadyTs }] of merged) {
    slotVotes.set(slot, {
      slot,
      notar: curves[VoteKind.Notar],
      notarFallback: curves[VoteKind.NotarFallback].ts.length
        ? sumCurves(curves[VoteKind.Notar], curves[VoteKind.NotarFallback])
        : null,
      finalize: curves[VoteKind.Finalize],
      skipAll: sumCurves(curves[VoteKind.Skip], curves[VoteKind.SkipFallback]),
      certs,
      ownVotes,
      parentReadyTs,
    });
  }
  return slotVotes;
}

function copyPartial({
  curves,
  certs,
  ownVotes,
  parentReadyTs,
}: SlotPartial): SlotPartial {
  return {
    curves: [...curves],
    certs: new Map(certs),
    ownVotes: new Map(ownVotes),
    parentReadyTs,
  };
}

function setEarliest<K>(map: Map<K, number>, key: K, ts: number) {
  const prev = map.get(key);
  if (prev === undefined || ts < prev) map.set(key, ts);
}

function getOwnVoteKind(event: number): VoteKind | undefined {
  const kind = event - OWN_VOTE_EVENT_OFFSET;
  return kind >= 0 && kind < VOTE_KIND_COUNT ? kind : undefined;
}

function minTs(a: number | undefined, b: number | undefined) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

export function getFadeTs(certs: ReadonlyMap<CertKind, number>) {
  return minTs(
    minTs(certs.get(CertKind.Finalize), certs.get(CertKind.FastFinalize)),
    certs.get(CertKind.Skip),
  );
}
