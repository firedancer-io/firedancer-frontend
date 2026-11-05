import { atom } from "jotai";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { AggGranularity, AggVotes } from "../../../api/types";
import { nsPerMs } from "../../../consts";
import { getBucketIdx } from "../utils";

export const drawEventType = "draw";

/** Latencies in ms from the slot's scheduled start */
export interface AggVotesBucket {
  notarized: number | null;
  fast: number | null;
  slow: number | null;
  skippedCnt: number;
}

type BucketsByIdx = Map<number, AggVotesBucket>;
export type AggVotesByGranularity = Map<AggGranularity, BucketsByIdx>;

const toMs = (ns: number | null) => (ns == null ? null : ns / nsPerMs);

export const [
  aggVotesEmitterAtom,
  aggVotesAtom,
  addAggVotesAtom,
  /** delete buckets, but don't emit a draw (skip redraw trigger) */
  deleteAggVotesBucketsAtom,
] = (function getAggVotesAtoms() {
  const _aggVotesAtom = atom<AggVotesByGranularity>(new Map());
  const emitterAtom = atom(
    new EventEmitter() as TypedEmitter<{ [drawEventType]: () => void }>,
  );

  return [
    emitterAtom,
    atom((get) => get(_aggVotesAtom)),
    atom(null, (get, set, value: AggVotes) => {
      set(_aggVotesAtom, (prev) => {
        const buckets =
          prev.get(value.granularity) ?? new Map<number, AggVotesBucket>();
        const startIdx = getBucketIdx(
          value.reference_ts_ns,
          value.granularity,
          false,
        );
        for (let i = 0; i < value.skipped_cnt.length; i++) {
          buckets.set(startIdx + i, {
            notarized: toMs(value.notarized_latency_ns[i]),
            fast: toMs(value.finalized_fast_latency_ns[i]),
            slow: toMs(value.finalized_slow_latency_ns[i]),
            skippedCnt: value.skipped_cnt[i],
          });
        }
        prev.set(value.granularity, buckets);
        return prev;
      });
      get(emitterAtom).emit(drawEventType);
    }),
    atom(
      null,
      (_get, set, granularity: AggGranularity, bucketIdxs: number[]) => {
        set(_aggVotesAtom, (prev) => {
          const buckets = prev.get(granularity);
          if (!buckets) return prev;
          for (const idx of bucketIdxs) buckets.delete(idx);
          return prev;
        });
      },
    ),
  ] as const;
})();
