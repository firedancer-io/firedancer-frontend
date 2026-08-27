/**
 * Body of the inline build-id verifier that vite.config.ts stamps into
 * index.html as `(${shellVerifierMain.toString()})(window,"<entry>")`,
 * with the hashed entry chunk path doubling as the build id (a matching
 * <meta name="fd-build"> marker is stamped alongside). The shell is
 * browser-cacheable, so a visit right after a deploy can boot a stale
 * shell: the verifier background-fetches "/" past the cache and, if the
 * served document carries a different id, flags window.__fdShellStale
 * (useFirstFlushReveal holds the reveal on it) and reloads. Inline, not
 * in a hashed chunk: a stale shell whose purged assets 404 must still
 * run it. Stringified at build time, so it must not reference imports
 * or the enclosing module scope.
 */

export const shellStaleEvent = "fd-shell-stale";

export interface ShellVerifierScope {
  __fdShellStale?: boolean;
  fetch(
    input: string,
    init: { cache: "no-store" },
  ): Promise<{ ok: boolean; text(): Promise<string> }>;
  dispatchEvent(event: Event): boolean;
  sessionStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  location: { reload(): void };
}

declare global {
  interface Window {
    __fdShellStale?: boolean;
  }
}

export function shellVerifierMain(
  w: ShellVerifierScope,
  id: string,
): Promise<void> {
  return w
    .fetch("/", { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : ""))
    .then((t) => {
      if (!t) return;
      // [\w./-] keeps this from matching its own source in the served
      // document (the "(" of the capture group is outside the class)
      const m = t.match(/<meta name="fd-build" content="([\w./-]+)"/);
      // a marker-less document is some other build too (e.g. a rollback
      // past the marker's introduction)
      const served = m ? m[1] : "";
      if (served === id) return;
      // one reload per served id: a pinned answer can't reload-loop
      try {
        if (w.sessionStorage.getItem("fd-shell-reload") === served) return;
        w.sessionStorage.setItem("fd-shell-reload", served);
      } catch {
        return;
      }
      w.__fdShellStale = true;
      w.dispatchEvent(new Event("fd-shell-stale"));
      w.location.reload();
    })
    .catch(() => {});
}
