import { useRef } from "react";
import { getDefaultStore } from "jotai";
import clsx from "clsx";
import { useAtomsSubscription } from "../../atomUtils";
import { hoveredRangeAtom, selectedRangeAtom, visibleRangeAtom } from "./atoms";
import styles from "./slotDividers.module.css";

const store = getDefaultStore();

function repositionDivider(
  el: HTMLElement | null,
  ms: number,
  visibleStart: number,
  visibleDuration: number,
) {
  if (!el) return;

  const offsetPct = (100 * (ms - visibleStart)) / visibleDuration;
  el.style.transform = `translateX(${offsetPct}%)`;
}

export default function SlotDividers() {
  const rootRef = useRef<HTMLDivElement>(null);

  const groupStartDividerRef = useRef<HTMLDivElement>(null);
  const slotStartDividerRef = useRef<HTMLDivElement>(null);
  const slotEndDividerRef = useRef<HTMLDivElement>(null);
  const groupEndDividerRef = useRef<HTMLDivElement>(null);

  useAtomsSubscription(
    [hoveredRangeAtom, selectedRangeAtom, visibleRangeAtom],
    () => {
      const root = rootRef.current;
      if (!root) return;

      const focusRange =
        store.get(selectedRangeAtom) ?? store.get(hoveredRangeAtom);
      const visibleRange = store.get(visibleRangeAtom);

      if (!focusRange || !visibleRange) {
        root.style.display = "none";
        return;
      }

      root.style.display = "block";

      const [visibleStart, visibleEnd] = visibleRange;
      const visibleDuration = visibleEnd - visibleStart;
      const [groupStart, groupEnd] = focusRange.group;
      const [slotStart, slotEnd] = focusRange.slot;

      repositionDivider(
        groupStartDividerRef.current,
        groupStart,
        visibleStart,
        visibleDuration,
      );
      repositionDivider(
        groupEndDividerRef.current,
        groupEnd,
        visibleStart,
        visibleDuration,
      );
      repositionDivider(
        slotStartDividerRef.current,
        slotStart,
        visibleStart,
        visibleDuration,
      );
      repositionDivider(
        slotEndDividerRef.current,
        slotEnd,
        visibleStart,
        visibleDuration,
      );
    },
  );

  return (
    <div ref={rootRef} className={styles.root}>
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
