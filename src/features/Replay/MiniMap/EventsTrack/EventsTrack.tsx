import { memo, useRef, useCallback, useLayoutEffect, useState } from "react";
import type { NsTsRange } from "../../../WebGl/webglUtils.ts";
import useTimelineEventsQuery from "../../Events/useTimelineEventsQuery.ts";
import { timelineEventTypes, eventsByTypeFamily } from "../../Events/atoms.ts";
import { calcAbsoluteNs } from "../../utils.ts";
import { Box } from "@radix-ui/themes";
import { referenceNsAtom, worldRangeAtom } from "../../atoms.ts";
import { getDefaultStore } from "jotai";
import type { TimelineEventType } from "../../../../api/entities.ts";
import { useThrottledCallbackIfVisible } from "../../../../api/useDebounceIfVisible.ts";
import PinContainer from "./EventMarker.tsx";
import {
  pinGroupPxThreshold,
  getEventGroupKey,
  getPxPerMs,
  type EventGroup,
} from "./utils.ts";
import styles from "./eventsTrack.module.css";

const store = getDefaultStore();

interface EventsTrackProps {
  width: number;
  panToTs: (ts: number) => void;
}

const EventsTrack = memo(function EventsTrack({
  width,
  panToTs,
}: EventsTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const query = useTimelineEventsQuery();

  const [pxPerMs, setPxPerMs] = useState(() => {
    const worldRange = store.get(worldRangeAtom);
    if (!worldRange) return;
    return getPxPerMs(width, worldRange[1] - worldRange[0]);
  });

  const throttledUpdatePxPerMs = useThrottledCallbackIfVisible(
    () => {
      const worldRange = store.get(worldRangeAtom);
      if (!worldRange) return;
      setPxPerMs(getPxPerMs(width, worldRange[1] - worldRange[0]));
    },
    100,
    { leading: true, trailing: true },
  );

  const updatePositions = useCallback((eventType?: TimelineEventType) => {
    const worldRange = store.get(worldRangeAtom);
    if (!worldRange) return;
    const [worldStartMs, worldEndMs] = worldRange;
    const worldSpanMs = worldEndMs - worldStartMs;
    if (worldSpanMs <= 0) return;

    for (const child of containerRef.current?.children ?? []) {
      const el = child as HTMLElement;
      // update events of specific type
      if (eventType != null && Number(el.dataset.type) !== eventType) continue;

      const ts = Number(el.dataset.ts);
      if (Number.isNaN(ts)) continue;
      // position as a % of the visible world range so pins scale with the track
      const leftPct = ((ts - worldStartMs) / worldSpanMs) * 100;
      el.style.transform = `translateX(${leftPct}%)`;
    }
  }, []);

  const onWorldRangeChange = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    if (referenceNs == null || !worldRange) return;

    const worldRangeNs: NsTsRange = [
      calcAbsoluteNs(referenceNs, worldRange[0]),
      calcAbsoluteNs(referenceNs, worldRange[1]),
    ];
    query(worldRangeNs);
    throttledUpdatePxPerMs();
  }, [query, throttledUpdatePxPerMs]);

  // subscribe
  useLayoutEffect(() => {
    const unsubscribeWorld = store.sub(worldRangeAtom, onWorldRangeChange);

    return () => {
      unsubscribeWorld();
    };
  }, [onWorldRangeChange]);

  // recompute px/ms on resize
  useLayoutEffect(() => {
    throttledUpdatePxPerMs();
  }, [width, throttledUpdatePxPerMs]);

  if (pxPerMs == null) return;

  return (
    <Box ref={containerRef} className={styles.eventsTrack}>
      {timelineEventTypes.map((type) => (
        <EventTypeTrack
          key={type}
          eventType={type}
          pxPerMs={pxPerMs}
          updatePositions={updatePositions}
          panToTs={panToTs}
        />
      ))}
    </Box>
  );
});

export default EventsTrack;

interface EventTypeTrackProps {
  eventType: TimelineEventType;
  pxPerMs: number;
  updatePositions: (eventType: TimelineEventType) => void;
  panToTs: (ts: number) => void;
}

function EventTypeTrack({
  eventType,
  pxPerMs,
  updatePositions,
  panToTs,
}: EventTypeTrackProps) {
  const [eventGroups, setEventGroups] = useState<EventGroup[]>([]);

  const throttledUpdateEventGroups = useThrottledCallbackIfVisible(
    () => {
      const events = store.get(eventsByTypeFamily(eventType));
      if (!events.length) {
        setEventGroups([]);
        return;
      }

      const groupThresholdMs =
        pxPerMs > 0 ? pinGroupPxThreshold / pxPerMs : Infinity;

      // Group slots that are close together
      const slotGroups: EventGroup["slots"][] = [];
      let currentGroup: EventGroup["slots"] = [];
      for (const { ts, slot } of events) {
        if (
          currentGroup.length &&
          // distance from first slot within group
          ts - currentGroup[0].ts <= groupThresholdMs
        ) {
          currentGroup.push({ ts, slot });
        } else {
          if (currentGroup.length) slotGroups.push(currentGroup);
          currentGroup = [{ ts, slot }];
        }
      }
      if (currentGroup.length) slotGroups.push(currentGroup);

      const groups = slotGroups.map((slots) => {
        return {
          // avg ts
          ts: slots.reduce((sum, s) => sum + s.ts, 0) / slots.length,
          slots,
        };
      });

      // reuse prev object refs for unchanged groups so memoized pins don't
      // re-render; keep the prev array ref too if nothing changed at all
      setEventGroups((prev) => {
        let changed = prev.length !== groups.length;
        const next = groups.map((g, i) => {
          const prevGroup = prev[i];
          if (
            prevGroup &&
            getEventGroupKey(prevGroup) === getEventGroupKey(g)
          ) {
            return prevGroup;
          }
          changed = true;
          return g;
        });
        return changed ? next : prev;
      });
    },
    100,
    { leading: true, trailing: true },
  );

  useLayoutEffect(() => {
    const unsubscribeEvents = store.sub(eventsByTypeFamily(eventType), () =>
      throttledUpdateEventGroups(),
    );

    return () => {
      unsubscribeEvents();
    };
  }, [eventType, throttledUpdateEventGroups]);

  // handle chart resize
  useLayoutEffect(() => {
    updatePositions(eventType);
    throttledUpdateEventGroups();
  }, [throttledUpdateEventGroups, pxPerMs, updatePositions, eventType]);

  // update positions of new groups
  useLayoutEffect(() => {
    updatePositions(eventType);
  }, [eventGroups, eventType, updatePositions]);

  return (
    <>
      {eventGroups.map((group) => (
        <PinContainer
          key={getEventGroupKey(group)}
          type={eventType}
          ts={group.ts}
          slots={group.slots}
          panToTs={panToTs}
        />
      ))}
    </>
  );
}
