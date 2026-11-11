import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { setStartupTimeAtom } from "./resetReplayState";
import { isDocumentVisibleAtom } from "../../atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import { createParallelCache } from "./parallelQueriesCache";
import { createTileCache } from "./tiles/cache";
import type { FetchResult, Interval } from "./tiles/splitFetch";
import { registerPrefetcher } from "./prefetchQueue";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const store = getDefaultStore();
const tileNs = 1_000n;
const bucketNs = 10n;
let worldRangeNs: [bigint, bigint];

interface Sent {
  track: string;
  queryId: number;
  tileIdx: number;
}
let sent: Sent[];
let chartCount = 0;
const disposers: (() => void)[] = [];
const tracksByName = new Map<string, ReturnType<typeof makeTrack>>();

function makeTrack(track: string) {
  const cache = createParallelCache<"g">({
    chartId: `queue-${chartCount++}`,
    getTileSizeNs: () => tileNs,
    overscanTilesCount: 0,
    queryKey: "query_agg_cpu",
    sendQuery: (queryId, startNs) => {
      sent.push({ track, queryId, tileIdx: Number(startNs / tileNs) });
    },
    getTileEvictionHighWatermark: () => 1000,
    getTileEvictionLowWatermark: () => 1000,
    onEvictTiles: () => {},
  });
  const unsubInit = cache.init();
  const unregister = registerPrefetcher(() =>
    cache.prefetchWorld(worldRangeNs, "g", bucketNs, undefined),
  );
  const unmount = () => {
    unregister();
    unsubInit();
    cache.clearPending();
  };
  disposers.push(unmount);

  const complete = () => {
    const mine = sent.filter((query) => query.track === track);
    sent = sent.filter((query) => query.track !== track);
    for (const { queryId } of mine) cache.markQueryComplete(queryId);
  };
  const handle = { cache, complete, unmount };
  tracksByName.set(track, handle);
  return handle;
}

const ownerOf = ({ track }: Sent) => tracksByName.get(track)!;

/** Answer every query until nothing more is sent */
function drain(...tracks: ReturnType<typeof makeTrack>[]) {
  while (sent.length) for (const track of tracks) track.complete();
}

let nowNs = 10_000_000_000n;
/** Advance the world clock, which pumps the queue */
function tick() {
  nowNs += 1_000_000n;
  store.set(smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>, nowNs);
  if (vi.isFakeTimers()) vi.advanceTimersByTime(100);
}

const sentBy = (track: string) =>
  sent.filter((query) => query.track === track).map(({ tileIdx }) => tileIdx);

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  worldRangeNs = [0n, 3_500n];
  store.set(isDocumentVisibleAtom, true);
  store.set(socketStateAtom, SocketState.Connected);
  store.set(setStartupTimeAtom, 0n);
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  tracksByName.clear();
  vi.useRealTimers();
});

describe("prefetchQueue", () => {
  it("keeps one prefetch in flight across tracks, taking turns", () => {
    makeTrack("a");
    makeTrack("b");
    expect(sent).toEqual([]);

    tick();
    expect(sent).toHaveLength(1);
    const [first] = sent;

    ownerOf(first).complete();
    expect(sent).toHaveLength(1);
    const [second] = sent;
    expect(second.track).not.toBe(first.track);

    ownerOf(second).complete();
    expect(sent.map(({ track }) => track)).toEqual([first.track]);
  });

  it("waits while any track loads a tile with nothing to draw", () => {
    makeTrack("a");
    makeTrack("b");
    tick();
    const [prefetch] = sent;
    sent = [];

    // the other track's view moves to a tile it doesn't have
    const viewer = ownerOf({
      ...prefetch,
      track: prefetch.track === "a" ? "b" : "a",
    });
    viewer.cache.queryRange([2_000n, 3_000n], worldRangeNs, "g", undefined);
    const [visible] = sent;
    expect(visible.tileIdx).toBe(2);
    sent = [];

    // the prefetch slot frees while the visible tile is still loading
    ownerOf(prefetch).cache.markQueryComplete(prefetch.queryId);
    expect(sent).toEqual([]);

    viewer.cache.markQueryComplete(visible.queryId);
    expect(sent).toHaveLength(1);
  });

  it("doesn't wait on refreshes of tiles that already have data", () => {
    const a = makeTrack("a");
    tick();
    drain(a);

    // a refreshes its stale tail tile
    a.cache.queryRange([3_000n, 3_500n], worldRangeNs, "g", undefined);
    expect(sentBy("a")).toEqual([3]);

    makeTrack("b");
    tick();
    expect(sentBy("b")).toEqual([0]);
  });

  it("waits while a tile cache loads a tile", async () => {
    vi.useRealTimers();
    const heldFetches: (() => void)[] = [];
    const tileCache = createTileCache<Interval[], null>({
      tileNs: 4_000_000_000n,
      minSubTileNs: 1_000_000n,
      maxItems: 1_000,
      maxTiles: 100,
      empty: () => [],
      merge: (acc, add) => acc.push(...add),
      itemCount: (data) => data.length,
      deriveMeta: () => null,
      fetch: (window) =>
        new Promise<FetchResult<Interval[]>>((resolve) => {
          heldFetches.push(() =>
            resolve({
              value: [window],
              chunksEndNs: window[1] + 1n,
              availableStartNs: null,
            }),
          );
        }),
      failPendingRequests: () => {},
    });
    disposers.push(() => tileCache.reset());
    tileCache.requestRange([0n, 3_999_999_999n], 100_000_000_000n);
    expect(heldFetches.length).toBeGreaterThan(0);

    const a = makeTrack("a");
    tick();
    expect(sent).toEqual([]);

    for (const resolveFetch of heldFetches.splice(0)) resolveFetch();
    await vi.waitFor(() => expect(sentBy("a")).toEqual([0]));
    a.complete();
  });

  it("frees the slot when a track unmounts mid-prefetch", () => {
    makeTrack("a");
    makeTrack("b");
    tick();
    const [prefetch] = sent;
    const other = prefetch.track === "a" ? "b" : "a";

    ownerOf(prefetch).unmount();
    expect(sentBy(prefetch.track)).toEqual([0]);
    expect(sentBy(other)).toEqual([0]);
  });

  it("prefetches new world tiles on the world range tick", () => {
    worldRangeNs = [0n, 1_000n];
    const a = makeTrack("a");
    tick();
    drain(a);

    worldRangeNs = [0n, 2_500n];
    tick();
    // the old tail tile settles first
    expect(sentBy("a")).toEqual([0]);
  });

  it("frees the slot when a disconnect or cache clear drops the prefetch", () => {
    makeTrack("a");
    makeTrack("b");
    tick();
    expect(sent).toHaveLength(1);

    store.set(socketStateAtom, SocketState.Disconnected);
    store.set(socketStateAtom, SocketState.Connected);
    sent = [];
    tick();
    expect(sent).toHaveLength(1);

    const [prefetch] = sent;
    sent = [];
    ownerOf(prefetch).cache.clearCache();
    expect(sent).toHaveLength(1);
  });

  it("ignores a reply to a dropped prefetch", () => {
    makeTrack("a");
    makeTrack("b");
    tick();
    const [dropped] = sent;

    store.set(socketStateAtom, SocketState.Disconnected);
    store.set(socketStateAtom, SocketState.Connected);
    sent = [];
    tick();
    expect(sent).toHaveLength(1);

    // the old reply mustn't free the new prefetch's slot
    sent = [];
    ownerOf(dropped).cache.markQueryComplete(dropped.queryId);
    expect(sent).toEqual([]);
    tick();
    expect(sent).toEqual([]);
  });
});
