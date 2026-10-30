import { atom } from "jotai";
import EventEmitter from "events";
import type {
  AggGranularity,
  AggShreds,
  ShredsGranularity,
  TimelineShreds,
} from "../../../api/types";
import {
  ShredsGranularityEnum,
  type AggShredEventType,
} from "../../../api/entities";
import { getBucketIdx } from "../utils";
import { mergeShredEvents } from "../../Shreds/dataUtils";
import type { SlotsShreds } from "../../Shreds/types";
import { referenceNsAtom } from "../atoms";
import { drawEventType, type DrawEmitter } from "../const";

export type ShredEventCounts = Record<AggShredEventType, number | null>;

/**
 * Buckets start at idx 0 of absolute world time
 */
type EventsByBucketIdx = Map<number, ShredEventCounts>;
export type ShredBucketsByGranularity = Map<AggGranularity, EventsByBucketIdx>;

export const [
  aggShredsEmitterAtom,
  aggShredsAtom,
  addAggShredsAtom,
  /** delete buckets, but don't emit a draw (skip redraw trigger) */
  deleteAggShredsBucketsAtom,
] = (function getAggShredsAtom() {
  const _aggShredsAtom = atom<ShredBucketsByGranularity>(new Map());

  return [
    atom(new EventEmitter() as DrawEmitter),
    atom((get) => get(_aggShredsAtom)),
    atom(
      null,
      (
        get,
        set,
        {
          granularity,
          reference_ts_ns,
          turbine,
          repair,
          reconstructed,
          published,
        }: AggShreds,
      ) => {
        if (turbine.length === 0) {
          get(aggShredsEmitterAtom).emit(drawEventType);
          return;
        }

        set(_aggShredsAtom, (prev) => {
          const eventsByBucketIdx =
            prev.get(granularity) ?? new Map<number, ShredEventCounts>();

          const startBucketIdx = getBucketIdx(
            reference_ts_ns,
            granularity,
            false,
          );

          for (let i = 0; i < turbine.length; i++) {
            const values = {
              turbine: turbine[i],
              repair: repair[i],
              reconstructed: reconstructed[i],
              published: published[i],
            };

            const bucketIdx = startBucketIdx + i;
            eventsByBucketIdx.set(bucketIdx, values);
          }

          prev.set(granularity, eventsByBucketIdx);
          return prev;
        });
        get(aggShredsEmitterAtom).emit(drawEventType);
      },
    ),
    atom(
      null,
      (_get, set, granularity: AggGranularity, bucketIdxs: number[]) => {
        set(_aggShredsAtom, (prev) => {
          const eventsByBucketIdx = prev.get(granularity);
          if (!eventsByBucketIdx) return prev;

          for (const bucketIdx of bucketIdxs) {
            eventsByBucketIdx.delete(bucketIdx);
          }

          prev.set(granularity, eventsByBucketIdx);
          return prev;
        });
      },
    ),
  ];
})();

/**
 * Store timeline shreds
 * Use replay reference ts for all ts deltas
 */
export function createShredAtoms() {
  const _emitterAtom = atom(new EventEmitter() as DrawEmitter);
  const _slotsShredAtom = atom<SlotsShreds>();
  const _tileToSlotsAtom = atom<Map<number, Set<number>>>(new Map());

  return {
    emitter: _emitterAtom,
    tileToSlots: atom((get) => get(_tileToSlotsAtom)),
    slotsShreds: atom((get) => get(_slotsShredAtom)),
    addShredEvents: atom(
      null,
      (get, set, tileIdx: number, data: TimelineShreds): number[] => {
        const referenceNs = get(referenceNsAtom);
        if (referenceNs == null) return [];

        const {
          reference_slot,
          reference_ts,
          slot_delta,
          idx,
          event,
          event_ts_delta,
          skipped,
        } = data;

        // a null reference means the tile carries no data
        if (reference_slot == null || reference_ts == null) {
          return [];
        }

        let touchedSlots: number[] = [];

        set(_slotsShredAtom, (prev) => {
          const updated: SlotsShreds = prev ?? {
            referenceTs: referenceNs,
            slots: new Map(),
          };

          const { touchedSlotNumbers } = mergeShredEvents(
            {
              reference_slot,
              reference_ts,
              slot_delta,
              idx,
              event,
              event_ts_delta,
            },
            updated,
          );

          // mark skipped slots, creating any that have no events yet
          for (const slotDelta of skipped) {
            const slotNumber = slotDelta + reference_slot;
            const slot = updated.slots.get(slotNumber) ?? { shreds: [] };
            slot.skipped = true;
            updated.slots.set(slotNumber, slot);
            touchedSlotNumbers.add(slotNumber);
          }

          // update tile's slots and slots' tiles
          set(_tileToSlotsAtom, (tileToSlots) => {
            const tileSlots = tileToSlots.get(tileIdx) ?? new Set<number>();
            tileToSlots.set(tileIdx, tileSlots);
            for (const slotNumber of touchedSlotNumbers) {
              tileSlots.add(slotNumber);
              const slot = updated.slots.get(slotNumber);
              if (slot) (slot.tiles ??= new Set()).add(tileIdx);
            }
            return tileToSlots;
          });

          touchedSlots = [...touchedSlotNumbers];
          return updated;
        });

        return touchedSlots;
      },
    ),
    /**
     * delete tiles. Delete slots that are no longer part of any stored tile
     */
    deleteTilesData: atom(null, (_get, set, tileIdxs: number[]) => {
      if (!tileIdxs.length) return;

      set(_tileToSlotsAtom, (prevTileToSlots) => {
        set(_slotsShredAtom, (prev) => {
          if (!prev?.slots) return prev;

          for (const tileIdx of tileIdxs) {
            const slotNumbers = prevTileToSlots.get(tileIdx);
            if (!slotNumbers) continue;

            for (const slotNumber of slotNumbers) {
              const slot = prev.slots.get(slotNumber);
              if (!slot) continue;

              slot.tiles?.delete(tileIdx);
              if (!slot.tiles?.size) {
                // delete slot if not part of any cached tile
                prev.slots.delete(slotNumber);
              }
            }
            prevTileToSlots.delete(tileIdx);
          }

          return prev;
        });
        return prevTileToSlots;
      });
    }),
  };
}

export const timelineShredsAtoms = createShredAtoms();
export const timelineFecShredsAtoms = createShredAtoms();

/** Resolve the non-agg atom set for a granularity */
export function getNonAggAtoms(granularity: ShredsGranularity) {
  return granularity === ShredsGranularityEnum.fec
    ? timelineFecShredsAtoms
    : timelineShredsAtoms;
}
