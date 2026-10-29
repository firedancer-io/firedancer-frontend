import { useRef } from "react";
import { getDefaultStore } from "jotai";
import clsx from "clsx";
import { useAtomsSubscription } from "../../atomUtils";
import { hoveredSlotAtom, visibleRangeAtom } from "./atoms";
import styles from "./hoverOverlay.module.css";

const store = getDefaultStore();

function moveBand(
  el: HTMLElement | null,
  startMs: number,
  endMs: number,
  visibleStart: number,
  visibleDuration: number,
) {
  if (!el) return;

  const offsetPct = (100 * (startMs - visibleStart)) / visibleDuration;
  const scaleX = Math.max(0, (endMs - startMs) / visibleDuration);
  el.style.transform = `translateX(${offsetPct}%) scaleX(${scaleX})`;
}

function moveDivider(
  el: HTMLElement | null,
  ms: number | undefined,
  visibleStart: number,
  visibleDuration: number,
) {
  if (!el) return;

  if (ms === undefined) {
    el.style.transform = "scaleX(0)";
    return;
  }
  const offsetPct = (100 * (ms - visibleStart)) / visibleDuration;
  el.style.transform = `translateX(${offsetPct}%)`;
}

/**
 * Full-height overlay spanning the header track down across all tracks.
 *
 * Splits the visible range into up to 5 disjoint sections around the hovered
 * slot:
 *   1. left of the hovered group        (other)
 *   2. left of the slot, within group   (group)
 *   3. the hovered slot                 (slot)
 *   4. right of the slot, within group  (group)
 *   5. right of the hovered group       (other)
 */
export default function HoverOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);

  // 5 disjoint, non-overlapping columns across the visible range
  const leftOtherBandRef = useRef<HTMLDivElement>(null);
  const leftGroupBandRef = useRef<HTMLDivElement>(null);
  const slotBandRef = useRef<HTMLDivElement>(null);
  const rightGroupBandRef = useRef<HTMLDivElement>(null);
  const rightOtherBandRef = useRef<HTMLDivElement>(null);

  // divider divs instead of using border, so we can scaleX the bands
  const groupStartDividerRef = useRef<HTMLDivElement>(null);
  const slotStartDividerRef = useRef<HTMLDivElement>(null);
  const slotEndDividerRef = useRef<HTMLDivElement>(null);
  const groupEndDividerRef = useRef<HTMLDivElement>(null);

  useAtomsSubscription([hoveredSlotAtom, visibleRangeAtom], () => {
    const root = rootRef.current;
    if (!root) return;

    const hovered = store.get(hoveredSlotAtom);
    const visibleRange = store.get(visibleRangeAtom);

    if (!hovered || !visibleRange) {
      root.style.display = "none";
      return;
    }

    root.style.display = "block";

    const [visibleStart, visibleEnd] = visibleRange;
    const visibleDuration = visibleEnd - visibleStart;
    const [groupStart, groupEnd] = hovered.ranges.group;
    const [slotStart, slotEnd] = hovered.ranges.slot;

    moveBand(
      leftOtherBandRef.current,
      visibleStart,
      groupStart,
      visibleStart,
      visibleDuration,
    );
    moveBand(
      leftGroupBandRef.current,
      groupStart,
      slotStart,
      visibleStart,
      visibleDuration,
    );
    moveBand(
      slotBandRef.current,
      slotStart,
      slotEnd,
      visibleStart,
      visibleDuration,
    );
    moveBand(
      rightGroupBandRef.current,
      slotEnd,
      groupEnd,
      visibleStart,
      visibleDuration,
    );
    moveBand(
      rightOtherBandRef.current,
      groupEnd,
      visibleEnd,
      visibleStart,
      visibleDuration,
    );

    moveDivider(
      groupStartDividerRef.current,
      groupStart,
      visibleStart,
      visibleDuration,
    );
    moveDivider(
      groupEndDividerRef.current,
      groupEnd,
      visibleStart,
      visibleDuration,
    );
    moveDivider(
      slotStartDividerRef.current,
      slotStart,
      visibleStart,
      visibleDuration,
    );
    moveDivider(
      slotEndDividerRef.current,
      slotEnd,
      visibleStart,
      visibleDuration,
    );
  });

  return (
    <div ref={rootRef} className={styles.root}>
      <div ref={leftOtherBandRef} className={clsx(styles.band, styles.other)} />
      <div ref={leftGroupBandRef} className={clsx(styles.band, styles.group)} />
      <div ref={slotBandRef} className={clsx(styles.band, styles.slot)} />
      <div
        ref={rightGroupBandRef}
        className={clsx(styles.band, styles.group)}
      />
      <div
        ref={rightOtherBandRef}
        className={clsx(styles.band, styles.other)}
      />

      <div
        ref={groupStartDividerRef}
        className={clsx(styles.divider, styles.groupDivider)}
      />
      <div
        ref={slotStartDividerRef}
        className={clsx(styles.divider, styles.slotDivider)}
      />
      <div
        ref={slotEndDividerRef}
        className={clsx(styles.divider, styles.slotDivider)}
      />
      <div
        ref={groupEndDividerRef}
        className={clsx(styles.divider, styles.groupDivider)}
      />
    </div>
  );
}
