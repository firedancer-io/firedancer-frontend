import { useEffect, useRef, type ReactNode } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { useAtomsSubscription } from "../../atomUtils";
import { TimelineEventType } from "../../api/entities";
import { visibleRangeAtom } from "./atoms";
import { eventsByTypeFamily } from "./Events/atoms";
import { isAggHeaderVisibleAtom } from "./HeaderTrack/aggAtoms";
import { useGetEpochForSlot } from "../../epochUtils";

const store = getDefaultStore();

interface EpochMarkersProps {
  rootClassName: string;
  markerParentClassName: string;
  hideWhenAggregate?: boolean;
  renderMarker: (epochNumber: number | undefined) => ReactNode;
}

export default function EpochMarkers({
  rootClassName,
  markerParentClassName,
  hideWhenAggregate = false,
  renderMarker,
}: EpochMarkersProps) {
  const epochStarts = useAtomValue(
    eventsByTypeFamily(TimelineEventType.EpochStart),
  );
  const getEpochForSlot = useGetEpochForSlot();
  const markerRefs = useRef(new Map<number, HTMLDivElement>());

  const reposition = () => {
    const visibleRange = store.get(visibleRangeAtom);
    const hidden =
      !visibleRange || (hideWhenAggregate && store.get(isAggHeaderVisibleAtom));

    for (const { slot, ts } of epochStarts) {
      const marker = markerRefs.current.get(slot);
      if (!marker) continue;

      if (hidden) {
        marker.style.display = "none";
        continue;
      }

      const [visibleStart, visibleEnd] = visibleRange;
      const visibleDuration = visibleEnd - visibleStart;
      if (visibleDuration <= 0) {
        marker.style.display = "none";
        continue;
      }

      const offsetPct = (100 * (ts - visibleStart)) / visibleDuration;
      marker.style.display = "block";
      marker.style.transform = `translateX(${offsetPct}%)`;
    }
  };

  useAtomsSubscription([visibleRangeAtom, isAggHeaderVisibleAtom], reposition);

  // reposition when the set of epoch-start events changes
  useEffect(reposition, [epochStarts, hideWhenAggregate]);

  return (
    <div className={rootClassName}>
      {epochStarts.map(({ slot }) => {
        const epochNumber = getEpochForSlot?.(slot);

        return (
          <div
            key={slot}
            ref={(el) => {
              if (el) markerRefs.current.set(slot, el);
              else markerRefs.current.delete(slot);
            }}
            className={markerParentClassName}
            style={{ display: "none" }}
          >
            {renderMarker(epochNumber)}
          </div>
        );
      })}
    </div>
  );
}
