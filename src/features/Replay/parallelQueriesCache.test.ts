import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { atom, getDefaultStore } from "jotai";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { createParallelCache } from "./parallelQueriesCache";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const store = getDefaultStore();
const tileNs = 1_000n;
const bucketNs = 10n;

let sent: { queryId: number; tileIdx: number; params: unknown }[];
let chartCount = 0;

const disposers: (() => void)[] = [];

function makeCache() {
  const cache = createParallelCache<"g", object | undefined>({
    chartId: `prefetch-${chartCount++}`,
    getTileSizeNs: () => tileNs,
    overscanTilesCount: 0,
    queryKey: "query_agg_cpu",
    sendQuery: (queryId, startNs, _endNs, _granularity, params) => {
      sent.push({ queryId, tileIdx: Number(startNs / tileNs), params });
    },
    getTileEvictionHighWatermark: () => 1000,
    getTileEvictionLowWatermark: () => 1000,
    onEvictTiles: () => {},
  });
  const unsub = cache.init();
  disposers.push(() => {
    unsub();
    cache.clearPending();
  });
  return cache;
}

function completeAll(cache: ReturnType<typeof makeCache>) {
  const ids = sent.map(({ queryId }) => queryId);
  sent = [];
  for (const id of ids) cache.markQueryComplete(id);
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
    completeAll(cache);
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
    completeAll(cache);
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
        sent.push({ queryId, tileIdx: Number(startNs / tileNs), params: 0 });
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

  it("skips tiles the server has evicted", () => {
    const cache = makeCache();
    cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined);
    const [first] = sent;
    sent = [];
    cache.markQueryComplete(first.queryId, undefined, 2_500n);
    expect(drain(cache, [0n, 3_500n])).toEqual([2, 3]);
  });
});
