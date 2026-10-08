import { atom, type Atom } from "jotai";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type {
  AggGranularity,
  AggShreds,
  ShredsGranularity,
  TimelineShreds,
} from "../../../api/types";
import {
  ShredEvent,
  ShredsGranularityEnum,
  type AggShredEventType,
} from "../../../api/entities";
import { getBucketIdx } from "../utils";
import {
  addEventToSlot,
  setMinDirtySlotByChartIfSmaller,
  type LiveShredsData,
  type SlotsShreds,
} from "../../Overview/ShredsProgression/atoms";
import { slotCaughtUpAtom } from "../../../api/atoms";
import { delayMs, xRangeMs } from "../../../api/worker/cache/shreds/shredsCalc";
import { smoothedNowMsAtom, epochAtom } from "../../../atoms";
import { nsPerMs, slotsPerLeader } from "../../../consts";
import { getSlotGroupLeader } from "../../../utils";
import { epochNow } from "../../../clockUtils";

export type ShredEventCounts = Record<AggShredEventType, number | null>;

export const drawEventType = "draw";

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
    atom(
      new EventEmitter() as TypedEmitter<{
        [drawEventType]: () => void;
      }>,
    ),
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

// non aggregate atoms
/**
 * Store timeline shreds
 * Use reference / delta slot number and timestamp to minimize memory usage
 */
export function createShredAtoms(
  expectedGranularity: ShredsGranularity,
  // Shared across both non-agg granularities so shred and fec store their event
  // deltas against the SAME referenceTs. Whichever granularity's first batch
  // arrives establishes it; the other rebases to it. This keeps every mesh's X
  // deltas consistent with the camera regardless of which granularity is active,
  // so slots don't jump on the X axis across a shred<->fec transition.
  sharedReferenceTsAtom: ReturnType<typeof atom<number | undefined>>,
) {
  const _skippedAtom = atom(new Set<number>());
  const _lastUpdateTsAtom = atom<number>(performance.now());
  const _minCompletedSlotAtom = atom<number>();
  const _liveShredsAtom = atom<SlotsShreds>();
  const _slotRangeAtom = atom<{
    min: number;
    max: number;
  }>();
  // Tile<->slot mapping for eviction. A tile is a ts-range query whose response
  // is ingested as slots; a slot's events can straddle a tile boundary, so a slot
  // can belong to several tiles. _slotToTiles is the refcount used to decide when
  // a slot is safe to delete (only when ALL its tiles are evicted); _tileToSlots
  // enumerates which slots to examine when a tile is evicted.
  const _tileToSlots = atom<Map<number, Set<number>>>(new Map());
  const _slotToTiles = atom<Map<number, Set<number>>>(new Map());
  const rangeAfterStartupAtom = atom((get) => {
    const range = get(_slotRangeAtom);
    const slotCaughtUp = get(slotCaughtUpAtom);
    if (!range || slotCaughtUp == null) return;

    // no slots after startup
    if (slotCaughtUp + 1 > range.max) return;

    return {
      min: Math.max(slotCaughtUp + 1, range.min),
      max: range.max,
    };
  });
  return {
    lastUpdateTs: atom((get) => get(_lastUpdateTsAtom)),
    skippedSlots: atom((get) => get(_skippedAtom)),
    /**
     * min completed slot we've seen since we started collecting data
     */
    minCompletedSlot: atom((get) => get(_minCompletedSlotAtom)),
    range: atom((get) => get(_slotRangeAtom)),
    rangeAfterStartup: rangeAfterStartupAtom,
    /**
     *  leader slots after startup, used for labels
     * */
    groupLeaderSlots: atom((get) => {
      const rangeAfterStartup = get(rangeAfterStartupAtom);
      if (!rangeAfterStartup) return [];

      const slots = [getSlotGroupLeader(rangeAfterStartup.min)];
      while (
        slots[slots.length - 1] + slotsPerLeader - 1 <
        rangeAfterStartup.max
      ) {
        slots.push(
          getSlotGroupLeader(slots[slots.length - 1] + slotsPerLeader),
        );
      }
      return slots;
    }),
    slotsShreds: atom((get) => get(_liveShredsAtom)),
    addShredEvents: atom(
      null,
      (get, set, tileIdx: number, batch: TimelineShreds[]) => {
        if (!batch.length) {
          set(_lastUpdateTsAtom, performance.now());
          return;
        }

        let slotRange = get(_slotRangeAtom);
        let newMinCompletedSlot = get(_minCompletedSlotAtom);

        let minEventSlot = Infinity;

        // slots this tile delivers; used to (re)build the tile<->slot mapping below
        const tileSlots = new Set<number>();

        // establish the shared reference from the first batch of whichever
        // granularity arrives first; both sets then rebase their events to it.
        // Items with a null reference (no data for that tile) carry no reference
        // ts, so use the first item that has one.
        let sharedReferenceTs = get(sharedReferenceTsAtom);
        if (sharedReferenceTs == null) {
          const firstWithReference = batch.find((b) => b.reference_ts != null);
          if (firstWithReference == null) {
            // whole batch is empty (all null references): nothing to store
            set(_lastUpdateTsAtom, performance.now());
            return;
          }
          sharedReferenceTs = Math.round(
            Number(firstWithReference.reference_ts! / BigInt(nsPerMs)),
          );
          set(sharedReferenceTsAtom, sharedReferenceTs);
        }

        set(_liveShredsAtom, (prev) => {
          const updated: SlotsShreds = prev ?? {
            referenceTs: sharedReferenceTs,
            slots: new Map(),
          };

          for (const {
            granularity,
            reference_slot,
            reference_ts,
            slot_delta,
            idx,
            event,
            event_ts_delta,
            skipped,
          } of batch) {
            // each atom set holds a single granularity; a mismatched batch means
            // a response was routed to the wrong set
            if (granularity !== expectedGranularity) {
              console.error(
                `shred batch granularity ${granularity} routed to ${expectedGranularity} atom set`,
              );
              continue;
            }
            // a null reference means the tile carries no data -> nothing to add
            if (reference_slot == null || reference_ts == null) {
              continue;
            }
            set(_skippedAtom, (prev) => {
              for (const slotDelta of skipped) {
                const slot = slotDelta + reference_slot;
                prev.add(slot);
              }
              return prev;
            });
            for (let i = 0; i < event.length; i++) {
              const ev = event[i];
              // unsupported event type
              if (!(ev in ShredEvent)) {
                console.debug(`received unsupported shred event type ${ev}`);
                continue;
              }

              if (slot_delta[i] == null || event_ts_delta[i] == null) {
                console.error(`invalid shred data arrays, missing index ${i}`);
                break;
              }

              const slotNumber = reference_slot + slot_delta[i];
              minEventSlot = Math.min(minEventSlot, slotNumber);
              tileSlots.add(slotNumber);

              const shredIdx = idx[i];

              // convert to current reference and delta
              const eventTsDelta = Math.round(
                (Number(reference_ts) + event_ts_delta[i]) / nsPerMs -
                  updated.referenceTs,
              );

              // add event to slot shred
              updated.slots.set(
                slotNumber,
                addEventToSlot(
                  shredIdx,
                  ev,
                  eventTsDelta,
                  updated.slots.get(slotNumber),
                ),
              );

              if (ev === ShredEvent.slot_complete) {
                newMinCompletedSlot = Math.min(
                  slotNumber,
                  newMinCompletedSlot ?? slotNumber,
                );
              }

              // update range
              slotRange = {
                min: Math.min(slotNumber, slotRange?.min ?? slotNumber),
                max: Math.max(slotNumber, slotRange?.max ?? slotNumber),
              };
            }
          }

          return updated;
        });

        // (Re)build this tile's slot mapping. Reset first so a refetch of the same
        // tile (live invalidation) doesn't leave stale refcounts: drop the tile
        // from every slot it previously referenced, then record the current set.
        const tileToSlots = get(_tileToSlots);
        const slotToTiles = get(_slotToTiles);
        const prevSlots = tileToSlots.get(tileIdx);
        if (prevSlots) {
          for (const slotNumber of prevSlots) {
            slotToTiles.get(slotNumber)?.delete(tileIdx);
          }
        }
        tileToSlots.set(tileIdx, tileSlots);
        for (const slotNumber of tileSlots) {
          let tiles = slotToTiles.get(slotNumber);
          if (!tiles) {
            tiles = new Set();
            slotToTiles.set(slotNumber, tiles);
          }
          tiles.add(tileIdx);
        }

        set(_slotRangeAtom, slotRange);
        set(_minCompletedSlotAtom, newMinCompletedSlot);

        // mark slot for redraw
        set(setMinDirtySlotByChartIfSmaller, minEventSlot);
        set(_lastUpdateTsAtom, performance.now());
      },
    ),
    // Batch-evict a set of tiles' data (set-difference). A slot is deleted only
    // when EVERY tile referencing it is in the evicted set D; a slot shared with
    // a surviving tile is kept, with the evicted tiles stripped from its tile set.
    // Does NOT bump _lastUpdateTsAtom (only off-screen tiles are evicted, so no
    // redraw is needed) and does NOT reset the shared referenceTs (kept so a later
    // refetch stays on the same X basis).
    deleteTilesData: atom(null, (get, set, tileIdxs: number[]) => {
      if (!tileIdxs.length) return;
      const D = new Set(tileIdxs);
      const tileToSlots = get(_tileToSlots);
      const slotToTiles = get(_slotToTiles);

      // candidate slots = union of the evicted tiles' slot sets
      const candidateSlots = new Set<number>();
      for (const tileIdx of D) {
        const slots = tileToSlots.get(tileIdx);
        if (slots) for (const s of slots) candidateSlots.add(s);
        tileToSlots.delete(tileIdx);
      }

      const deletedSlots = new Set<number>();
      for (const slotNumber of candidateSlots) {
        const tiles = slotToTiles.get(slotNumber);
        if (!tiles) continue;
        // does any tile outside D still own this slot?
        let hasSurvivor = false;
        for (const t of tiles) {
          if (!D.has(t)) {
            hasSurvivor = true;
            break;
          }
        }
        if (hasSurvivor) {
          // keep the slot; just drop the evicted tiles from its set
          for (const t of D) tiles.delete(t);
        } else {
          slotToTiles.delete(slotNumber);
          deletedSlots.add(slotNumber);
        }
      }

      if (!deletedSlots.size) return;

      set(_skippedAtom, (prev) => {
        for (const slotNumber of deletedSlots) prev.delete(slotNumber);
        return prev;
      });

      set(_liveShredsAtom, (prev) => {
        if (!prev) return prev;
        for (const slotNumber of deletedSlots) prev.slots.delete(slotNumber);

        // recompute range from remaining slots (arbitrary eviction can drop the
        // current min AND max), clearing it when nothing is left
        if (prev.slots.size === 0) {
          set(_slotRangeAtom, undefined);
        } else {
          let min = Infinity;
          let max = -Infinity;
          for (const slotNumber of prev.slots.keys()) {
            if (slotNumber < min) min = slotNumber;
            if (slotNumber > max) max = slotNumber;
          }
          set(_slotRangeAtom, { min, max });
        }
        return prev;
      });
    }),
    // TODO: update deletion
    deleteSlots:
      /**
       * Delete slots that completed before the chart x-axis starting time, or with dots outside visible x range
       * Update the min slot
       */
      atom(
        null,
        (
          get,
          set,
          deleteAll: boolean,
          isStartup: boolean,
          keepReferenceTs?: boolean,
        ) => {
          if (deleteAll) {
            set(_slotRangeAtom, undefined);
            set(_minCompletedSlotAtom, undefined);
            if (keepReferenceTs) {
              set(_liveShredsAtom, (prev) => {
                if (!prev) return;
                return {
                  ...prev,
                  slots: new Map(),
                };
              });
            } else {
              set(_liveShredsAtom, undefined);
            }
            return;
          }

          set(_liveShredsAtom, (prev) => {
            const slotRange = get(_slotRangeAtom);
            const now = get(smoothedNowMsAtom) ?? epochNow();

            if (!prev || !slotRange) return prev;

            if (isStartup) {
              // During startup, we only show event dots, not spans. Delete slots without events in chart view
              for (
                let slotNumber = slotRange.min;
                slotNumber <= slotRange.max;
                slotNumber++
              ) {
                const slot = prev.slots.get(slotNumber);
                if (!slot) continue;
                if (
                  slot.maxEventTsDelta == null ||
                  isBeforeChartX(slot.maxEventTsDelta, now, prev.referenceTs)
                ) {
                  prev.slots.delete(slotNumber);
                }
              }
            } else {
              // After startup complete
              let minSlot = slotRange.min;
              const targetSlotDurationNs =
                get(epochAtom)?.target_slot_duration_nanos;
              const targetMs =
                targetSlotDurationNs == null
                  ? 400
                  : targetSlotDurationNs / nsPerMs;
              const countToKeep = Math.ceil((xRangeMs * 2) / targetMs);
              if (slotRange.max - slotRange.min > countToKeep) {
                // only keep countToKeep slots
                for (
                  let slotNumber = minSlot;
                  slotNumber <= slotRange.max - countToKeep;
                  slotNumber++
                ) {
                  const slot = prev.slots.get(slotNumber);
                  if (!slot) continue;
                  prev.slots.delete(slotNumber);
                }

                minSlot = slotRange.max - countToKeep + 1;
              }

              let shouldDeleteSlot = false;
              for (
                let slotNumber = slotRange.max;
                slotNumber >= minSlot;
                slotNumber--
              ) {
                const slot = prev.slots.get(slotNumber);
                if (slot?.maxEventTsDelta == null) continue;

                if (
                  !shouldDeleteSlot &&
                  slot.completionTsDelta != null &&
                  isBeforeChartX(slot.completionTsDelta, now, prev.referenceTs)
                ) {
                  // once we find a slot that is complete and far enough in the past,
                  // delete all slot numbers less it but keep this one for label spacing reference
                  shouldDeleteSlot = true;
                  continue;
                }

                if (shouldDeleteSlot) {
                  prev.slots.delete(slotNumber);
                }
              }
            }

            // update range to reflect remaining slots
            const remainingSlotNumbers = prev.slots.keys();
            set(_slotRangeAtom, (prevRange) => {
              if (!prevRange || !prev.slots.size) {
                return;
              }
              return {
                min: Math.min(...remainingSlotNumbers),
                max: prevRange.max,
              };
            });

            return prev;
          });
        },
      ),
  };
}

function isBeforeChartX(tsDelta: number, now: number, referenceTs: number) {
  const nowDelta = now - referenceTs;
  const chartXRange = xRangeMs + delayMs;
  return nowDelta - tsDelta > chartXRange;
}

// One reference ts shared by both non-agg granularities (see createShredAtoms).
const sharedNonAggReferenceTsAtom = atom<number | undefined>(undefined);

export const timelineShredsAtoms = createShredAtoms(
  ShredsGranularityEnum.shred,
  sharedNonAggReferenceTsAtom,
);
export const timelineFecShredsAtoms = createShredAtoms(
  ShredsGranularityEnum.fec,
  sharedNonAggReferenceTsAtom,
);

/** Resolve the non-agg atom set for a granularity */
export function getNonAggAtoms(granularity: ShredsGranularity) {
  return granularity === ShredsGranularityEnum.fec
    ? timelineFecShredsAtoms
    : timelineShredsAtoms;
}

function makeShredsDataAtom(
  atoms: ReturnType<typeof createShredAtoms>,
): Atom<LiveShredsData> {
  return atom<LiveShredsData>((get) => ({
    slotsShreds: get(atoms.slotsShreds),
    range: get(atoms.range),
    minCompletedSlot: get(atoms.minCompletedSlot),
  }));
}

/**
 * Reference ts (ms) used to position the non-agg camera. Both granularities share
 * one reference (sharedNonAggReferenceTsAtom), so this reads the shared value and
 * is available as soon as EITHER granularity has received data. Reading it per
 * granularity from that set's own slotsShreds.referenceTs would leave the camera
 * reference undefined for a granularity that has no data yet (e.g. fec before any
 * fec batch, when it is drawn purely from shred fallback) — which would stall the
 * camera on pan until fec data arrived.
 */
export const shredsTimelineReferenceTsAtoms: Record<
  ShredsGranularity,
  Atom<number | undefined>
> = {
  [ShredsGranularityEnum.shred]: sharedNonAggReferenceTsAtom,
  [ShredsGranularityEnum.fec]: sharedNonAggReferenceTsAtom,
};

/** Per-granularity live non-agg shred data, selected by the active granularity */
export const timelineShredsDataAtoms: Record<
  ShredsGranularity,
  Atom<LiveShredsData>
> = {
  [ShredsGranularityEnum.shred]: makeShredsDataAtom(timelineShredsAtoms),
  [ShredsGranularityEnum.fec]: makeShredsDataAtom(timelineFecShredsAtoms),
};
