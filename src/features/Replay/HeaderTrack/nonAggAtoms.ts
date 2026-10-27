import { atom } from "jotai";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { TimelineSlots } from "../../../api/types";
import { referenceNsAtom } from "../atoms";
import { calcRelativeMs } from "../utils";
import { getSlotGroupLeader } from "../../../utils";

export const drawEventType = "draw";

/**
 * ts relative to replay referenceNs
 */
export interface SlotInfo {
  slot: number;
  startMs: number;
  endMs: number;
  isSkipped: boolean;
  isMine: boolean;
}

export interface SlotGroup {
  leaderSlot: number;
  slots: Map<number, SlotInfo>;
  tileIdxs: Set<number>;
}

export const [
  timelineSlotsEmitterAtom,
  timelineSlotsAtom,
  addTimelineSlotsAtom,
  /** delete tiles, but don't emit a draw (skip redraw trigger) */
  deleteTimelineSlotTilesAtom,
] = (function getNonAggSlotsAtom() {
  const _timelineSlotGroupsAtom = atom({
    slotGroups: new Map<number, SlotGroup>(),
    tileSlotGroups: new Map<number, Set<number>>(),
  });

  return [
    atom(
      new EventEmitter() as TypedEmitter<{
        [drawEventType]: () => void;
      }>,
    ),
    atom((get) => get(_timelineSlotGroupsAtom)),
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
        ) {
          get(timelineSlotsEmitterAtom).emit(drawEventType);
          return;
        }

        const referenceNs = get(referenceNsAtom);
        if (referenceNs == null) return;

        set(_timelineSlotGroupsAtom, (prev) => {
          const { slotGroups, tileSlotGroups } = prev;

          for (let i = 0; i < slot_delta.length; i++) {
            const slotDelta = slot_delta[i];
            const slot = slotDelta + reference_slot;
            const startMs = calcRelativeMs(
              referenceNs,
              start_ts_delta[i] + reference_ts,
            );
            const endMs = calcRelativeMs(
              referenceNs,
              end_ts_delta[i] + reference_ts,
            );

            const leaderSlot = getSlotGroupLeader(slot);
            let group = slotGroups.get(leaderSlot);
            if (!group) {
              group = {
                leaderSlot,
                slots: new Map(),
                tileIdxs: new Set(),
              };
              slotGroups.set(leaderSlot, group);
            }

            const slotInfo: SlotInfo = {
              slot,
              startMs,
              endMs,
              isSkipped: false,
              isMine: false,
            };
            // create new reference to be picked up with render
            group.slots = new Map(group.slots);
            group.slots.set(slot, slotInfo);

            // update tile mappings
            group.tileIdxs.add(tileIdx);

            const tileGroups = tileSlotGroups.get(tileIdx) ?? new Set();
            tileGroups.add(leaderSlot);
            tileSlotGroups.set(tileIdx, tileGroups);
          }

          for (const slotDelta of skipped) {
            const slot = slotDelta + reference_slot;
            const leaderSlot = getSlotGroupLeader(slot);
            const slotInfo = slotGroups.get(leaderSlot)?.slots.get(slot);
            if (slotInfo) slotInfo.isSkipped = true;
          }

          for (const slotDelta of mine) {
            const slot = slotDelta + reference_slot;
            const leaderSlot = getSlotGroupLeader(slot);
            const slotInfo = slotGroups.get(leaderSlot)?.slots.get(slot);
            if (slotInfo) slotInfo.isMine = true;
          }

          return { slotGroups, tileSlotGroups };
        });

        get(timelineSlotsEmitterAtom).emit(drawEventType);
      },
    ),
    atom(null, (_get, set, tileIdxs: number[]) => {
      set(_timelineSlotGroupsAtom, (prev) => {
        const { slotGroups, tileSlotGroups } = prev;

        for (const tileIdx of tileIdxs) {
          const leaderSlots = tileSlotGroups.get(tileIdx);
          if (!leaderSlots) continue;

          for (const leaderSlot of leaderSlots) {
            const group = slotGroups.get(leaderSlot);
            if (!group) continue;

            group.tileIdxs.delete(tileIdx);

            // delete the whole group only once every tile it belonged to is gone
            if (group.tileIdxs.size === 0) {
              slotGroups.delete(leaderSlot);
            }
          }

          tileSlotGroups.delete(tileIdx);
        }

        return { slotGroups, tileSlotGroups };
      });
    }),
  ];
})();
