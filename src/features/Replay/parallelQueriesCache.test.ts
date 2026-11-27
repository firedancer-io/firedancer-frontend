import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { isDocumentVisibleAtom } from "../../atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import { createParallelCache } from "./parallelQueriesCache";
import { isLiveAtom, pauseAtom } from "./atoms";
import { setStartupTimeAtom } from "./resetReplayState";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const store = getDefaultStore();
const tileNs = 1_000n;
const bucketNs = 10n;

let sent: {
  queryId: number;
  tileIdx: number;
  startNs: bigint;
  params: unknown;
}[];
let chartCount = 0;

const disposers: (() => void)[] = [];

type CacheOpts = Parameters<
  typeof createParallelCache<"g", object | undefined>
>[0];

function makeCache(overrides: Partial<CacheOpts> = {}) {
  const cache = createParallelCache<"g", object | undefined>({
    chartId: `prefetch-${chartCount++}`,
    getTileSizeNs: () => tileNs,
    overscanTilesCount: 0,
    queryKey: "query_agg_cpu",
    sendQuery: (queryId, startNs, _endNs, _granularity, params) => {
      sent.push({
        queryId,
        tileIdx: Number(startNs / tileNs),
        startNs,
        params,
      });
    },
    getTileEvictionHighWatermark: () => 1000,
    getTileEvictionLowWatermark: () => 1000,
    onEvictTiles: () => {},
    ...overrides,
  });
  const unsub = cache.init();
  disposers.push(() => {
    unsub();
    cache.clearPending();
  });
  return cache;
}

/** Answer every sent query, with the server's data ending at dataEndNs */
function completeAll(cache: ReturnType<typeof makeCache>, dataEndNs: bigint) {
  const ids = sent.map(({ queryId }) => queryId);
  sent = [];
  for (const id of ids) cache.markQueryComplete(id, dataEndNs);
}

const tileIdxs = () => sent.map(({ tileIdx }) => tileIdx);

/** Prefetch, answering each query before the next call, and return the order */
function drain(
  cache: ReturnType<typeof makeCache>,
  worldRangeNs: [bigint, bigint],
  params?: object,
) {
  const order: number[] = [];
  for (;;) {
    cache.prefetchWorld(worldRangeNs, "g", bucketNs, params);
    if (!sent.length) return order;
    order.push(...tileIdxs());
    completeAll(cache, worldRangeNs[1]);
  }
}

beforeEach(() => {
  sent = [];
  store.set(socketStateAtom, SocketState.Connected);
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

describe("prefetchWorld", () => {
  it("sends one tile at a time, the next after each response", () => {
    const cache = makeCache();
    cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([0]);

    const inFlight = sent;
    sent = [];
    cache.prefetchWorld([0n, 3_505n], "g", bucketNs, undefined);
    expect(sent).toEqual([]);

    sent = inFlight;
    completeAll(cache, 3_505n);
    expect(drain(cache, [0n, 3_505n])).toEqual([1, 2, 3]);
  });

  it("skips a tile the visible query is loading", () => {
    const cache = makeCache();
    cache.queryRange([0n, 1_000n], [0n, 3_500n], "g", undefined);
    expect(tileIdxs()).toEqual([0]);

    sent = [];
    cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined);
    expect(sent).toEqual([]);
  });

  it("doesn't prefetch before init or after its cleanup", () => {
    const cache = createParallelCache<"g", object | undefined>({
      chartId: `prefetch-${chartCount++}`,
      getTileSizeNs: () => tileNs,
      overscanTilesCount: 0,
      queryKey: "query_agg_cpu",
      sendQuery: (queryId, startNs) => {
        sent.push({
          queryId,
          tileIdx: Number(startNs / tileNs),
          startNs,
          params: 0,
        });
      },
      getTileEvictionHighWatermark: () => 1000,
      getTileEvictionLowWatermark: () => 1000,
      onEvictTiles: () => {},
    });
    expect(cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined)).toBe(
      false,
    );

    const unsub = cache.init();
    expect(cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined)).toBe(
      true,
    );
    unsub();
    cache.clearPending();
    expect(cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined)).toBe(
      false,
    );
  });

  it("puts at most one prefetch ahead of a visible query", () => {
    const cache = makeCache();
    cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined);
    cache.prefetchWorld([0n, 3_510n], "g", bucketNs, undefined);
    cache.queryRange([2_000n, 3_000n], [0n, 3_500n], "g", undefined);
    expect(tileIdxs()).toEqual([0, 2]);
  });

  it("refreshes the tail tile once per new world end bucket", () => {
    const cache = makeCache();
    expect(drain(cache, [0n, 3_500n])).toEqual([0, 1, 2, 3]);
    expect(drain(cache, [0n, 3_509n])).toEqual([]);
    expect(drain(cache, [0n, 3_510n])).toEqual([3]);
    expect(drain(cache, [0n, 3_515n])).toEqual([]);

    // the old tail is settled once the world passes it
    expect(drain(cache, [0n, 4_100n])).toEqual([3, 4]);
    expect(drain(cache, [0n, 4_105n])).toEqual([]);
    expect(drain(cache, [0n, 4_110n])).toEqual([4]);
  });

  it("refetches with new params after clearCache", () => {
    const cache = makeCache();
    drain(cache, [0n, 1_500n], { tiles: [1] });

    cache.clearCache();
    const newParams = { tiles: [2] };
    cache.prefetchWorld([0n, 1_500n], "g", bucketNs, newParams);
    expect(sent).toEqual([
      expect.objectContaining({ tileIdx: 0, params: newParams }),
    ]);
  });

  it("waits for a connection and resends a tile dropped on disconnect", () => {
    const cache = makeCache();
    const unsub = cache.init();

    store.set(socketStateAtom, SocketState.Disconnected);
    cache.prefetchWorld([0n, 1_500n], "g", bucketNs, undefined);
    expect(sent).toEqual([]);

    store.set(socketStateAtom, SocketState.Connected);
    cache.prefetchWorld([0n, 1_500n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([0]);

    sent = [];
    store.set(socketStateAtom, SocketState.Disconnected);
    store.set(socketStateAtom, SocketState.Connected);
    expect(drain(cache, [0n, 1_500n])).toEqual([0, 1]);
    unsub();
  });

  it("fetches a tile past the server's data once per world end bucket", () => {
    const cache = makeCache();
    const prefetch = (worldEndNs: bigint) => {
      cache.prefetchWorld([0n, worldEndNs], "g", bucketNs, undefined);
      return tileIdxs();
    };
    const answer = (dataEndNs: bigint) => {
      const [query] = sent;
      sent = [];
      cache.markQueryComplete(query.queryId, dataEndNs);
    };

    expect(prefetch(1_505n)).toEqual([0]);
    // the server's data ends before tile 0 does, so it waits for the next
    // bucket while the next tile goes
    answer(900n);
    expect(prefetch(1_505n)).toEqual([1]);
    answer(950n);
    expect(prefetch(1_505n)).toEqual([]);
    expect(prefetch(1_515n)).toEqual([0]);
  });

  it("refetches a stale tile right away once the server's data passes it", () => {
    const cache = makeCache();
    cache.prefetchWorld([0n, 1_505n], "g", bucketNs, undefined);
    cache.markQueryComplete(sent[0].queryId, 900n);
    sent = [];
    cache.prefetchWorld([0n, 1_505n], "g", bucketNs, undefined);
    // tile 1's reply shows the server's data now covers tile 0
    cache.markQueryComplete(sent[0].queryId, 1_200n);
    sent = [];
    cache.prefetchWorld([0n, 1_505n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([0]);
  });

  it("waits for a tile's query in flight without counting it", () => {
    const cache = makeCache();
    cache.queryRange([0n, 1_000n], [0n, 1_505n], "g", undefined);
    cache.markQueryComplete(sent[0].queryId, 900n);
    sent = [];
    // a visible refresh of tile 0 is in flight
    cache.queryRange([0n, 1_000n], [0n, 1_505n], "g", undefined);
    const [visible] = sent;
    sent = [];
    expect(cache.prefetchWorld([0n, 1_505n], "g", bucketNs, undefined)).toBe(
      false,
    );
    cache.markQueryComplete(visible.queryId, 950n);
    // prefetch never fetched tile 0 this bucket, so it may now
    cache.prefetchWorld([0n, 1_505n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([0]);
  });

  it("skips tiles the server has evicted", () => {
    const cache = makeCache();
    cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined);
    const [first] = sent;
    sent = [];
    cache.markQueryComplete(first.queryId, 3_500n, 2_500n);
    expect(drain(cache, [0n, 3_500n])).toEqual([2, 3]);
  });
});

describe("fetchPartialStaleTile", () => {
  const visibleNs: [bigint, bigint] = [1_000n, 2_000n];

  /** Query the visible tile, answer it with chunksEndNs, return the next start */
  function refresh(
    cache: ReturnType<typeof makeCache>,
    worldEndNs: bigint,
    chunksEndNs: bigint,
  ) {
    cache.queryRange(visibleNs, [0n, worldEndNs], "g", undefined);
    const [query] = sent;
    sent = [];
    cache.markQueryComplete(query.queryId, chunksEndNs);
    return query.startNs;
  }

  it("refreshes a stale tile from its fetched end", () => {
    const cache = makeCache({ fetchPartialStaleTile: true });
    expect(refresh(cache, 1_500n, 1_400n)).toBe(1_000n);
    expect(refresh(cache, 1_800n, 1_700n)).toBe(1_400n);
    // an empty response keeps the previous end
    expect(refresh(cache, 1_900n, 0n)).toBe(1_700n);
    expect(refresh(cache, 1_900n, 1_800n)).toBe(1_700n);
  });

  it("stops refreshing once the tile is complete", () => {
    const cache = makeCache({ fetchPartialStaleTile: true });
    refresh(cache, 1_500n, 1_400n);
    // world end moved past the tile, so the response completes it
    expect(refresh(cache, 2_500n, 2_000n)).toBe(1_400n);
    cache.queryRange(visibleNs, [0n, 2_500n], "g", undefined);
    expect(sent).toEqual([]);
  });

  it("completes the tail tile once the server's data passes its end", () => {
    const cache = makeCache({ fetchPartialStaleTile: true });
    refresh(cache, 1_500n, 1_400n);
    // client world end lags the server's data
    refresh(cache, 1_900n, 2_000n);
    cache.queryRange(visibleNs, [0n, 1_900n], "g", undefined);
    expect(sent).toEqual([]);
  });

  it("keeps a tile stale without a data end", () => {
    const cache = makeCache();
    // a past tile, but the server has no data yet
    cache.queryRange(visibleNs, [0n, 2_500n], "g", undefined);
    cache.markQueryComplete(sent[0].queryId, null);
    sent = [];
    cache.queryRange(visibleNs, [0n, 2_500n], "g", undefined);
    expect(tileIdxs()).toEqual([1]);
  });

  it("keeps a tile stale until the server's data passes its end", () => {
    const cache = makeCache();
    // world end already moved past the tile, but the server's data hasn't
    refresh(cache, 2_500n, 1_900n);
    cache.queryRange(visibleNs, [0n, 2_500n], "g", undefined);
    expect(sent.map(({ startNs }) => startNs)).toEqual([1_000n]);
  });

  it("refetches the whole tile when disabled", () => {
    const cache = makeCache();
    refresh(cache, 1_500n, 1_400n);
    expect(refresh(cache, 1_800n, 1_700n)).toBe(1_000n);
  });
});

describe("eviction", () => {
  const evictingCache = (
    watermark: number,
    evicted: number[],
    fetchPartialStaleTile = false,
  ) => {
    const cache = makeCache({
      getTileEvictionHighWatermark: () => watermark,
      getTileEvictionLowWatermark: () => watermark,
      onEvictTiles: (_granularity, tileIdxs) => evicted.push(...tileIdxs),
      fetchPartialStaleTile,
    });
    /** Query a visible tile and return the query id it sent */
    const view = (tileIdx: number) => {
      const startNs = BigInt(tileIdx) * tileNs;
      cache.queryRange(
        [startNs, startNs + tileNs],
        [0n, 10_000n],
        "g",
        undefined,
      );
      return sent.shift()?.queryId;
    };
    return { cache, view };
  };

  it("evicts the farthest tile, stale or not", () => {
    const evicted: number[] = [];
    const { cache, view } = evictingCache(2, evicted);
    cache.markQueryComplete(view(0)!, 10_000n);
    // stale, next to the visible tile
    cache.markQueryComplete(view(4)!, 4_500n);
    cache.markQueryComplete(view(5)!, 10_000n);
    expect(evicted).toEqual([0]);
  });

  it("cancels the refresh of a tile evicted while it was in flight", () => {
    const evicted: number[] = [];
    const { cache, view } = evictingCache(1, evicted, true);
    cache.markQueryComplete(view(9)!, 9_400n);
    const refreshId = view(9)!;
    // pan away and load another tile while the refresh is in flight
    cache.markQueryComplete(view(0)!, 10_000n);
    expect(evicted).toEqual([9]);
    // panning back refetches the whole tile
    cache.queryRange([9_000n, 10_000n], [0n, 10_000n], "g", undefined);
    expect(sent.map(({ startNs }) => startNs)).toEqual([9_000n]);
    // and the cancelled refresh's reply, missing the evicted head, is ignored
    expect(cache.markQueryComplete(refreshId, 10_000n)).toBeUndefined();
  });
});

describe("stale tile in view while not live", () => {
  const setNowNs = (ns: bigint | undefined) =>
    store.set(smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>, ns);

  afterEach(() => {
    setNowNs(undefined);
    vi.useRealTimers();
  });

  it("refetches on world range ticks until the server's data covers it", () => {
    vi.useFakeTimers();
    store.set(isDocumentVisibleAtom, true);
    store.set(setStartupTimeAtom, 0n);
    setNowNs(10_000_000_000n);
    store.set(pauseAtom, [0, 9_000]);
    expect(store.get(isLiveAtom)).toBe(false);

    const cache = makeCache();
    const answer = (dataEndNs: bigint) => {
      const [query] = sent;
      sent = [];
      cache.markQueryComplete(query.queryId, dataEndNs);
    };
    // tile 5 is in view, and the server's data ends inside it
    cache.queryRange([5_000n, 6_000n], [0n, 9_500_000_000n], "g", undefined);
    answer(5_500n);

    // each world range tick refetches it
    setNowNs(10_100_000_000n);
    expect(tileIdxs()).toEqual([5]);
    answer(5_700n);
    vi.advanceTimersByTime(100);
    setNowNs(10_200_000_000n);
    expect(tileIdxs()).toEqual([5]);

    // until the server's data covers it
    answer(6_000n);
    vi.advanceTimersByTime(100);
    setNowNs(10_300_000_000n);
    expect(sent).toEqual([]);
  });
});
