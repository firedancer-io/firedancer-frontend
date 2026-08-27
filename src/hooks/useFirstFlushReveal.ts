import { useEffect, useState, useSyncExternalStore } from "react";
import { useAtomValue } from "jotai";
import { firstFlushAppliedAtom } from "../api/ws/atoms";
import { firstFlushRevealCapMs } from "../consts";
import { shellStaleEvent } from "../shellVerifier";

const subscribeShellStale = (cb: () => void) => {
  window.addEventListener(shellStaleEvent, cb);
  return () => window.removeEventListener(shellStaleEvent, cb);
};
const shellStale = () => window.__fdShellStale === true;

/**
 * Merge the empty-chrome and first-data paints: keep the shell hidden
 * (dark ground) until the first ws flush has applied. The first batch
 * applies into the module store before React mounts when the socket is
 * fast, so the mount commit itself is the reveal; a slow origin paints
 * the empty skeleton after the cap, as before.
 *
 * Held while the inline build-id verifier reports a stale shell: its
 * reload is already in flight, so the stale build never paints. Only a
 * returned mismatch holds — a pending answer never blocks the reveal.
 */
export function useFirstFlushReveal(): boolean {
  const firstFlushApplied = useAtomValue(firstFlushAppliedAtom);
  const stale = useSyncExternalStore(subscribeShellStale, shellStale);
  const [revealCapped, setRevealCapped] = useState(false);
  useEffect(() => {
    if (firstFlushApplied) return;
    const timeout = window.setTimeout(
      () => setRevealCapped(true),
      firstFlushRevealCapMs,
    );
    return () => clearTimeout(timeout);
  }, [firstFlushApplied]);
  return (firstFlushApplied || revealCapped) && !stale;
}
