import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { atomWithImmer } from "jotai-immer";
import {
  TimelineEventType,
  isTimelineIdentityEvent,
} from "../../../api/entities";
import type { TimelineEvents } from "../../../api/types";
import { referenceNsAtom } from "../atoms";
import { calcRelativeMs, insertSorted } from "../utils";

export interface EventTs {
  slot: number;
  ts: number;
}

export interface EventIdentityFields {
  identity_result: string;
  identity_from: string;
  identity_to: string;
  identity_notes: string;
}

export type EventInfo = EventTs & Partial<EventIdentityFields>;

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
  atomWithImmer<EventInfo[]>([]),
);

export const timelineEventTypes = Object.values(TimelineEventType).filter(
  (v): v is TimelineEventType => typeof v === "number",
);

function pushEvent(
  byType: Map<TimelineEventType, EventInfo[]>,
  event: TimelineEventType,
  storedEvent: EventInfo,
) {
  let group = byType.get(event);
  if (!group) {
    group = [];
    byType.set(event, group);
  }
  group.push(storedEvent);
}

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
    const byType = new Map<TimelineEventType, EventInfo[]>();
    // identity_* arrays have 1 entry per identity event in order
    let identityIdx = 0;
    for (let i = 0; i < value.slot.length; i++) {
      const event = value.event[i];
      const eventTs: EventTs = {
        slot: value.slot[i],
        ts: calcRelativeMs(referenceNs, value.ts[i]),
      };

      if (isTimelineIdentityEvent(event)) {
        const identityEvent: EventTs & EventIdentityFields = {
          ...eventTs,
          identity_result: value.identity_result[identityIdx],
          identity_from: value.identity_from[identityIdx],
          identity_to: value.identity_to[identityIdx],
          identity_notes: value.identity_notes[identityIdx],
        };
        identityIdx++;
        pushEvent(byType, event, identityEvent);
      } else {
        pushEvent(byType, event, eventTs);
      }
    }

    for (const [event, incoming] of byType) {
      set(eventsByTypeFamily(event), (draft) => {
        for (const eventTs of incoming) {
          insertSorted(draft, eventTs, compareSlotTs);
        }
      });
    }
  },
);
