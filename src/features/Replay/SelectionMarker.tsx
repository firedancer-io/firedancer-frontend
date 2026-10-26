import { useRef } from "react";
import { getDefaultStore } from "jotai";
import { useAtomsSubscription } from "../../atomUtils";
import { selectedMsAtom, visibleRangeAtom, worldRangeAtom } from "./atoms";
import styles from "./selectionMarker.module.css";

const store = getDefaultStore();

const rangeAtoms = {
  visible: visibleRangeAtom,
  world: worldRangeAtom,
};

interface SelectionMarkerProps {
  range?: keyof typeof rangeAtoms;
}

export default function SelectionMarker({
  range = "visible",
}: SelectionMarkerProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const rangeAtom = rangeAtoms[range];

  useAtomsSubscription([selectedMsAtom, rangeAtom], () => {
    const el = lineRef.current;
    if (!el) return;

    const selectedMs = store.get(selectedMsAtom);
    const range = store.get(rangeAtom);
    const xPct =
      selectedMs != null && range
        ? (100 * (selectedMs - range[0])) / (range[1] - range[0])
        : NaN;

    if (!Number.isFinite(xPct)) {
      el.style.visibility = "hidden";
      return;
    }

    el.style.visibility = "visible";
    el.style.setProperty("--x-pct", String(xPct));
  });

  return (
    <div className={styles.clip}>
      <div ref={lineRef} className={styles.line} />
    </div>
  );
}
