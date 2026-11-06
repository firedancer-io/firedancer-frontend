import { useRef } from "react";
import { getDefaultStore } from "jotai";
import { useAtomsSubscription } from "../../../atomUtils";
import {
  hoveredAggHeaderAtom,
  referenceNsAtom,
  visibleRangeAtom,
} from "../atoms";
import { nsBucketSizes } from "../const";
import { calcRelativeMs } from "../utils";
import { aggTrackHeight } from "./const";
import styles from "./aggHeaderBucketHighlight.module.css";

const store = getDefaultStore();

/**
 * 1px white border around the hovered agg header bucket
 */
export default function AggHeaderBucketHighlight() {
  const positionerRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);

  useAtomsSubscription(
    [hoveredAggHeaderAtom, visibleRangeAtom, referenceNsAtom],
    () => {
      const positioner = positionerRef.current;
      const el = borderRef.current;
      if (!positioner || !el) return;

      const hovered = store.get(hoveredAggHeaderAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const referenceNs = store.get(referenceNsAtom);
      if (!hovered || !visibleRange || referenceNs == null) {
        positioner.style.display = "none";
        return;
      }

      const { bucketIdx, granularity } = hovered;
      const bucketSizeNs = nsBucketSizes[granularity];
      const startNs = BigInt(bucketIdx) * bucketSizeNs;
      const endNs = startNs + bucketSizeNs;

      const startMs = calcRelativeMs(referenceNs, startNs);
      const endMs = calcRelativeMs(referenceNs, endNs);

      const [visibleStart, visibleEnd] = visibleRange;
      const visibleDuration = visibleEnd - visibleStart;

      const leftPct = (100 * (startMs - visibleStart)) / visibleDuration;
      const rightPct = (100 * (endMs - visibleStart)) / visibleDuration;
      const widthPct = rightPct - leftPct;

      positioner.style.display = "block";
      positioner.style.transform = `translateX(${leftPct}%)`;
      el.style.width = `${widthPct}%`;
    },
  );

  return (
    <div ref={positionerRef} className={styles.positioner}>
      <div
        ref={borderRef}
        className={styles.border}
        style={{ height: aggTrackHeight }}
      />
    </div>
  );
}
