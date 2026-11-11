import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { useMeasure } from "react-use";
import { useAtomsSubscription } from "../../atomUtils";
import type { TimelineEventType } from "../../api/entities";
import { visibleRangeAtom } from "./atoms";
import { eventsByTypeFamily, type EventInfo } from "./Events/atoms";
import { isAggHeaderVisibleAtom } from "./HeaderTrack/aggAtoms";

const store = getDefaultStore();

// shown by reposition once positioned
const hiddenStyle = { display: "none" };

// room for an "Epoch N" label to the right of its marker
export const EPOCH_LABEL_WIDTH_PX = 100;

/** px a marker draws past its ts on each side, so it stays while partly visible */
export interface CullMarginPx {
  left: number;
  right: number;
}

// first idx with ts at or after minTs. events are sorted by ts
function getFirstIdxFrom(events: EventInfo[], minTs: number) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].ts < minTs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface TrackEventMarkersProps {
  eventType: TimelineEventType;
  rootClassName: string;
  markerParentClassName: string;
  /** only show, and track the range, in this header mode */
  showIn: "agg" | "nonAgg";
  cullMarginPx: CullMarginPx;
  renderMarker: (slot: number) => ReactNode;
}

function isSameEvents(a: EventInfo[], b: EventInfo[]) {
  return a.length === b.length && a.every((event, i) => event === b[i]);
}

export default function TrackEventMarkers({
  eventType,
  rootClassName,
  markerParentClassName,
  showIn,
  cullMarginPx,
  renderMarker,
}: TrackEventMarkersProps) {
  const events = useAtomValue(eventsByTypeFamily(eventType));
  const markerRefs = useRef(new Map<number, HTMLDivElement>());
  // measured, as reading layout on each range change forces a reflow
  const [measureRef, { width: widthPx }] = useMeasure<HTMLDivElement>();
  const [visibleEvents, setVisibleEvents] = useState<EventInfo[]>([]);

  const reposition = useCallback(() => {
    const visibleRange = store.get(visibleRangeAtom);
    const hidden =
      !visibleRange || (showIn === "agg") !== store.get(isAggHeaderVisibleAtom);
    const visibleDuration = visibleRange
      ? visibleRange[1] - visibleRange[0]
      : 0;
    if (hidden || visibleDuration <= 0 || widthPx <= 0) {
      // hide now, not only once React unmounts them
      for (const marker of markerRefs.current.values()) {
        marker.style.display = "none";
      }
      setVisibleEvents((prev) => (prev.length ? [] : prev));
      return;
    }

    const [visibleStart, visibleEnd] = visibleRange;
    const msPerPx = visibleDuration / widthPx;
    const minTs = visibleStart - cullMarginPx.left * msPerPx;
    const maxTs = visibleEnd + cullMarginPx.right * msPerPx;

    const nextVisible: EventInfo[] = [];
    const nextVisibleSlots = new Set<number>();
    const dpr = window.devicePixelRatio;
    for (let i = getFirstIdxFrom(events, minTs); i < events.length; i++) {
      const event = events[i];
      if (event.ts > maxTs) break;
      nextVisible.push(event);
      nextVisibleSlots.add(event.slot);

      const marker = markerRefs.current.get(event.slot);
      if (!marker) continue;
      // px, not %, so a marker needn't be as wide as the track.
      const offsetPx =
        Math.round(((event.ts - visibleStart) / msPerPx) * dpr) / dpr;
      marker.style.display = "block";
      marker.style.transform = `translateX(${offsetPx}px)`;
    }
    // markers leaving view are hidden now, not only once React unmounts them
    for (const [slot, marker] of markerRefs.current) {
      if (!nextVisibleSlots.has(slot)) marker.style.display = "none";
    }
    setVisibleEvents((prev) =>
      isSameEvents(prev, nextVisible) ? prev : nextVisible,
    );
  }, [events, showIn, cullMarginPx.left, cullMarginPx.right, widthPx]);

  useAtomsSubscription([visibleRangeAtom, isAggHeaderVisibleAtom], reposition);

  // reposition when the events, width, or mounted markers change. Before paint,
  // so new markers don't show a frame late
  useLayoutEffect(reposition, [reposition, visibleEvents]);

  return (
    <div ref={measureRef} className={rootClassName}>
      {visibleEvents.map(({ slot }) => (
        <Marker
          key={slot}
          slot={slot}
          markerRefs={markerRefs}
          className={markerParentClassName}
          renderMarker={renderMarker}
        />
      ))}
    </div>
  );
}

interface MarkerProps {
  slot: number;
  markerRefs: MutableRefObject<Map<number, HTMLDivElement>>;
  className: string;
  renderMarker: TrackEventMarkersProps["renderMarker"];
}

// memo so markers already shown don't re-render when others enter or leave
const Marker = memo(function Marker({
  slot,
  markerRefs,
  className,
  renderMarker,
}: MarkerProps) {
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) markerRefs.current.set(slot, el);
      else markerRefs.current.delete(slot);
    },
    [markerRefs, slot],
  );

  return (
    <div ref={setRef} className={className} style={hiddenStyle}>
      {renderMarker(slot)}
    </div>
  );
});
