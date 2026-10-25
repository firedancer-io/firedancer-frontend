import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { atomWithImmer } from "jotai-immer";
import { TimelineEventType } from "../../../api/entities";
import type { TimelineEvents } from "../../../api/types";
import { referenceNsAtom } from "../atoms";
import { calcRelativeMs, insertSorted } from "../utils";

export interface EventTs {
  slot: number;
  ts: number;
}

export interface TimelineEvent extends EventTs {
  type: TimelineEventType;
}

/**
 * Order events by ascending ts, then ascending slot on ties. Returns 0 only for
 * the same (ts, slot), which counts as a duplicate
 */
export function compareSlotTs(a: EventTs, b: EventTs): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.slot - b.slot;
}

/**
 * Sorted array of events for each event type. ts are relative to replay reference ts
 */
export const eventsByTypeFamily = atomFamily((_type: TimelineEventType) =>
  atomWithImmer<EventTs[]>([]),
);

export const timelineEventTypes = Object.values(TimelineEventType).filter(
  (v): v is TimelineEventType => typeof v === "number",
);

/**
 * Add events to sorted list. Drop duplicates
 */
export const appendTimelineEventsAtom = atom(
  null,
  (get, set, value: TimelineEvents) => {
    if (value.slot.length === 0) {
      return;
    }

    const referenceNs = get(referenceNsAtom);
    if (referenceNs == null) return;

    // group the batch by type so each touched type's atom is updated once
    const byType = new Map<TimelineEventType, EventTs[]>();
    for (let i = 0; i < value.slot.length; i++) {
      const event = value.event[i];
      const slotTs: EventTs = {
        slot: value.slot[i],
        ts: calcRelativeMs(referenceNs, value.ts[i]),
      };

      let group = byType.get(event);
      if (!group) {
        group = [];
        byType.set(event, group);
      }
      group.push(slotTs);
    }

    for (const [event, incoming] of byType) {
      set(eventsByTypeFamily(event), (draft) => {
        for (const slotTs of incoming) {
          insertSorted(draft, slotTs, compareSlotTs);
        }
      });
    }
  },
);
