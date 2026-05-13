import { useEffect, useRef, useState } from "react";

const DELTA_WINDOW_MS = 5_000;
export const DELTA_WINDOW_LABEL = `Last ${DELTA_WINDOW_MS / 1_000}s`;
const SAMPLE_INTERVAL_MS = 1_000;

type DeltaEntry = { added: string[]; removed: string[]; timestamp: number };

function diffSets(prev: Set<string>, next: Set<string>) {
  const added = [...next].filter((pubkey) => !prev.has(pubkey));
  const removed = [...prev].filter((pubkey) => !next.has(pubkey));
  return { added, removed };
}

function countUniquePubkeys(history: DeltaEntry[], field: "added" | "removed") {
  const pubkeys = new Set<string>();
  for (const entry of history) {
    for (const pk of entry[field]) pubkeys.add(pk);
  }
  return pubkeys.size;
}

export function useCountDelta(pubkeys: Set<string>) {
  const historyRef = useRef<DeltaEntry[]>([]);
  const pubkeysRef = useRef(pubkeys);
  const pubkeysPrevSnapshotRef = useRef(pubkeys);
  const [deltas, setDeltas] = useState({ added: 0, removed: 0 });

  pubkeysRef.current = pubkeys;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      // Add to history if there is a diff in current and previous pubkeys
      const { added, removed } = diffSets(
        pubkeysPrevSnapshotRef.current,
        pubkeysRef.current,
      );
      pubkeysPrevSnapshotRef.current = pubkeysRef.current;
      if (added.length > 0 || removed.length > 0) {
        historyRef.current.push({ added, removed, timestamp: now });
      }

      // Expire entries and recompute counts
      const cutoff = now - DELTA_WINDOW_MS;
      historyRef.current = historyRef.current.filter(
        (e) => e.timestamp >= cutoff,
      );
      setDeltas((prev) => {
        const next = {
          added: countUniquePubkeys(historyRef.current, "added"),
          removed: countUniquePubkeys(historyRef.current, "removed"),
        };
        if (prev.added === next.added && prev.removed === next.removed)
          return prev;
        return next;
      });
    }, SAMPLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return deltas;
}
