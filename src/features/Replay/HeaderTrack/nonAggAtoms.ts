import { atom } from "jotai";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { TimelineSlots } from "../../../api/types";

export const drawEventType = "draw";

interface TileSlots {
  referenceSlot: number;
  referenceNs: bigint;
  slotDeltas: number[];
  startTsDeltas: bigint[];
  endTsDeltas: bigint[];
  skippedDeltas: Set<number>;
  mineDeltas: Set<number>;
}

/**
 * Tiles start at idx 0 for 0n absolute ns ts
 */
type SlotsByTileIdx = Map<number, TileSlots>;

export const [
  timelineSlotsEmitterAtom,
  timelineSlotsAtom,
  addTimelineSlotsAtom,
  /** delete tiles, but don't emit a draw (skip redraw trigger) */
  deleteTimelineSlotTilesAtom,
] = (function getNonAggSlotsAtom() {
  const _timelineSlotsAtom = atom<SlotsByTileIdx>(new Map());

  return [
    atom(
      new EventEmitter() as TypedEmitter<{
        [drawEventType]: () => void;
      }>,
    ),
    atom((get) => get(_timelineSlotsAtom)),
    atom(
      null,
      (
        get,
        set,
        tileIdx: number,
        {
          reference_slot,
          reference_ts,
          slot_delta,
          start_ts_delta,
          end_ts_delta,
          skipped,
          mine,
        }: TimelineSlots,
      ) => {
        if (
          reference_slot == null ||
          reference_ts == null ||
          slot_delta.length === 0
        )
          return;

        set(_timelineSlotsAtom, (prev) => {
          prev.set(tileIdx, {
            referenceSlot: reference_slot,
            referenceNs: reference_ts,
            slotDeltas: slot_delta,
            startTsDeltas: start_ts_delta,
            endTsDeltas: end_ts_delta,
            skippedDeltas: new Set(skipped),
            mineDeltas: new Set(mine),
          });
          return prev;
        });
        get(timelineSlotsEmitterAtom).emit(drawEventType);
      },
    ),
    atom(null, (_get, set, tileIdxs: number[]) => {
      set(_timelineSlotsAtom, (prev) => {
        for (const tileIdx of tileIdxs) {
          prev.delete(tileIdx);
        }
        return prev;
      });
    }),
  ];
})();
