import { atom } from "jotai";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { AggGranularity, AggSlots } from "../../../api/types";
import { getBucketIdx } from "../utils";

export const drawEventType = "draw";

export interface SlotCounts {
  start_slot: number | null;
  end_slot: number | null;
  skipped: number | null;
  mine: number | null;
  mine_skipped: number | null;
}

/**
 * Buckets start at idx 0 for 0n absolute ns ts
 */
type SlotsByBucketIdx = Map<number, SlotCounts>;
export type SlotBucketsByGranularity = Map<AggGranularity, SlotsByBucketIdx>;

export const [
  aggHeaderEmitterAtom,
  aggSlotsAtom,
  addAggSlotsAtom,
  /** delete buckets, but don't emit a draw (skip redraw trigger) */
  deleteAggSlotsBucketsAtom,
] = (function getAggSlotsAtom() {
  const _aggSlotsAtom = atom<SlotBucketsByGranularity>(new Map());

  return [
    atom(
      new EventEmitter() as TypedEmitter<{
        [drawEventType]: () => void;
      }>,
    ),
    atom((get) => get(_aggSlotsAtom)),
    atom(
      null,
      (
        get,
        set,
        {
          granularity,
          reference_ts_ns,
          start_slot,
          end_slot,
          skipped,
          mine,
          mine_skipped,
        }: AggSlots,
      ) => {
        if (start_slot.length === 0) {
          get(aggHeaderEmitterAtom).emit(drawEventType);
          return;
        }

        set(_aggSlotsAtom, (prev) => {
          const slotsByBucketIdx =
            prev.get(granularity) ?? new Map<number, SlotCounts>();

          const startBucketIdx = getBucketIdx(
            reference_ts_ns,
            granularity,
            false,
          );

          for (let i = 0; i < start_slot.length; i++) {
            const values = {
              start_slot: start_slot[i],
              end_slot: end_slot[i],
              skipped: skipped[i],
              mine: mine[i],
              mine_skipped: mine_skipped[i],
            };

            const bucketIdx = startBucketIdx + i;
            slotsByBucketIdx.set(bucketIdx, values);
          }

          prev.set(granularity, slotsByBucketIdx);
          return prev;
        });
        get(aggHeaderEmitterAtom).emit(drawEventType);
      },
    ),
    atom(
      null,
      (_get, set, granularity: AggGranularity, bucketIdxs: number[]) => {
        set(_aggSlotsAtom, (prev) => {
          const slotsByBucketIdx = prev.get(granularity);
          if (!slotsByBucketIdx) return prev;

          for (const bucketIdx of bucketIdxs) {
            slotsByBucketIdx.delete(bucketIdx);
          }

          prev.set(granularity, slotsByBucketIdx);
          return prev;
        });
      },
    ),
  ];
})();
