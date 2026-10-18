import { atom } from "jotai";
import type { LiveShreds } from "../../../api/types";
import { xRangeMs } from "../../Shreds/const";
import { nsPerMs, slotsPerLeader } from "../../../consts";
import { getSlotGroupLeader } from "../../../utils";
import { smoothedNowNsAtom, epochAtom } from "../../../atoms";
import { slotCaughtUpAtom } from "../../../api/atoms";
import { getDelayedNowNs } from "./utils";
import { epochNow } from "../../../clockUtils";
import { msToNs } from "../../../numUtils";
import { calcRelativeMs } from "../../Replay/utils";
import { setMinDirtySlotByChartIfSmaller } from "../../Shreds/atoms";
import { mergeShredEvents } from "../../Shreds/dataUtils";
import type { SlotRange, SlotsShreds } from "../../Shreds/types";

/**
 * Store live shreds
 * Use reference / delta slot number and timestamp to minimize memory usage
 */
export function createLiveShredsAtoms() {
  const _minCompletedSlotAtom = atom<number>();
  const _liveShredsAtom = atom<SlotsShreds>();
  const _slotRangeAtom = atom<{
    min: number;
    max: number;
  }>();
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
      (
        get,
        set,
        {
          reference_slot,
          reference_ts,
          slot_delta,
          shred_idx,
          event,
          event_ts_delta,
        }: LiveShreds,
      ) => {
        let minEventSlot = Infinity;
        let newMinCompletedSlot: number | undefined;
        let slotRange: SlotRange | undefined;

        set(_liveShredsAtom, (prev) => {
          const updated: SlotsShreds = prev ?? {
            referenceTs: reference_ts,
            slots: new Map(),
          };

          ({ minEventSlot, newMinCompletedSlot, slotRange } = mergeShredEvents(
            {
              reference_slot,
              reference_ts,
              slot_delta,
              idx: shred_idx,
              event,
              event_ts_delta,
            },
            updated,
          ));

          set(_slotRangeAtom, (prevRange) => {
            if (!slotRange) return prevRange;
            return {
              min: Math.min(slotRange.min, prevRange?.min ?? slotRange.min),
              max: Math.max(slotRange.max, prevRange?.max ?? slotRange.max),
            };
          });

          return updated;
        });

        // fold this message's results into the stored min completed slot
        set(_minCompletedSlotAtom, (prev) => {
          if (newMinCompletedSlot == null) return prev;
          return Math.min(newMinCompletedSlot, prev ?? newMinCompletedSlot);
        });

        // mark slot for redraw
        set(setMinDirtySlotByChartIfSmaller, minEventSlot);
      },
    ),

    deleteSlots:
      /**
       * Delete slots that completed before the chart x-axis starting time, or with dots outside visible x range
       * Update the min slot
       */
      atom(null, (get, set, deleteAll: boolean, isStartup: boolean) => {
        if (deleteAll) {
          set(_slotRangeAtom, undefined);
          set(_minCompletedSlotAtom, undefined);
          set(_liveShredsAtom, undefined);
          return;
        }

        set(_liveShredsAtom, (prev) => {
          const slotRange = get(_slotRangeAtom);
          const delayedNowNs = getDelayedNowNs(
            get(smoothedNowNsAtom) ?? msToNs(epochNow()),
          );

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
                isBeforeChartX(
                  slot.maxEventTsDelta,
                  delayedNowNs,
                  prev.referenceTs,
                )
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
                isBeforeChartX(
                  slot.completionTsDelta,
                  delayedNowNs,
                  prev.referenceTs,
                )
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
      }),
  };
}

function isBeforeChartX(
  tsDelta: number,
  delayedNowNs: bigint,
  referenceTs: bigint,
) {
  const nowDelta = calcRelativeMs(referenceTs, delayedNowNs);
  return nowDelta - tsDelta > xRangeMs;
}

export const shredsAtoms = createLiveShredsAtoms();

export const liveShredsPostStartupRangeAtom = atom((get) =>
  get(shredsAtoms.rangeAfterStartup),
);

/**
 *  leader slots after startup, used for labels
 * */
export const liveShredsPostStartupLeaderSlotsAtom = atom((get) => {
  const rangeAfterStartup = get(liveShredsPostStartupRangeAtom);
  if (!rangeAfterStartup) return;

  return {
    min: getSlotGroupLeader(rangeAfterStartup.min),
    max: getSlotGroupLeader(rangeAfterStartup.max),
  };
});
