import { useRef } from "react";
import { getDefaultStore } from "jotai";
import { useAtomsSubscription } from "../../atomUtils";
import { hoveredMsAtom, visibleRangeAtom } from "./atoms";
import styles from "./hoveredTsLine.module.css";

const store = getDefaultStore();

/**
 * Line to mark hovered ts
 */
export default function HoveredTsLine() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useAtomsSubscription([hoveredMsAtom, visibleRangeAtom], () => {
    const root = rootRef.current;
    const line = lineRef.current;
    if (!root || !line) return;

    const hoveredMs = store.get(hoveredMsAtom);
    const visibleRange = store.get(visibleRangeAtom);

    if (hoveredMs === undefined || !visibleRange) {
      root.style.display = "none";
      return;
    }

    root.style.display = "block";

    const [visibleStart, visibleEnd] = visibleRange;
    const offsetPct =
      (100 * (hoveredMs - visibleStart)) / (visibleEnd - visibleStart);
    line.style.transform = `translateX(${offsetPct}%)`;
  });

  return (
    <div ref={rootRef} className={styles.root}>
      <div ref={lineRef} className={styles.line} />
    </div>
  );
}
