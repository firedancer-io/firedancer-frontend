import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { firstFlushAppliedAtom } from "../api/ws/atoms";
import { firstFlushRevealCapMs } from "../consts";

/**
 * Merge the empty-chrome and first-data paints: keep the shell hidden
 * (dark ground) until the first ws flush has applied. The first batch
 * applies into the module store before React mounts when the socket is
 * fast, so the mount commit itself is the reveal; a slow origin paints
 * the empty skeleton after the cap, as before.
 */
export function useFirstFlushReveal(): boolean {
  const firstFlushApplied = useAtomValue(firstFlushAppliedAtom);
  const [revealCapped, setRevealCapped] = useState(false);
  useEffect(() => {
    if (firstFlushApplied) return;
    const timeout = window.setTimeout(
      () => setRevealCapped(true),
      firstFlushRevealCapMs,
    );
    return () => clearTimeout(timeout);
  }, [firstFlushApplied]);
  return firstFlushApplied || revealCapped;
}
