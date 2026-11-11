import { getDefaultStore } from "jotai";
import { throttleIfVisible } from "../../api/useDebounceIfVisible";
import { worldRangeAtom } from "./atoms";

// the server answers queries in order, so prefetch one at a time and only
// while nothing on screen is loading
const store = getDefaultStore();

// caches loading tiles that have nothing to draw yet
const loadingOwners = new Set<object>();
// each sends its next prefetch query and returns whether it did
const prefetchers: (() => boolean)[] = [];
let nextPrefetcherIdx = 0;
let isPrefetching = false;
let stopWorldTick: (() => void) | undefined;

function pump() {
  if (isPrefetching || loadingOwners.size > 0) return;
  for (let i = 0; i < prefetchers.length; i++) {
    const idx = (nextPrefetcherIdx + i) % prefetchers.length;
    if (prefetchers[idx]()) {
      isPrefetching = true;
      nextPrefetcherIdx = idx + 1;
      return;
    }
  }
}

export function setLoading(owner: object, isLoading: boolean) {
  if (isLoading) {
    loadingOwners.add(owner);
  } else if (loadingOwners.delete(owner)) {
    pump();
  }
}

/** Call when the prefetch query in flight completes or is dropped */
export function endPrefetch() {
  isPrefetching = false;
  pump();
}

export function registerPrefetcher(prefetchNext: () => boolean) {
  prefetchers.push(prefetchNext);
  if (!stopWorldTick) {
    // the world end grows new tiles to prefetch
    const throttledPump = throttleIfVisible(pump, 100);
    const unsub = store.sub(worldRangeAtom, throttledPump);
    stopWorldTick = () => {
      unsub();
      throttledPump.cancel();
    };
  }

  return () => {
    prefetchers.splice(prefetchers.indexOf(prefetchNext), 1);
    if (prefetchers.length) return;
    stopWorldTick?.();
    stopWorldTick = undefined;
  };
}
