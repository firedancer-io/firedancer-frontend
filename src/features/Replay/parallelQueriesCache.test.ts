import { describe, it, expect, beforeEach, vi } from "vitest";
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

function makeCache() {
  return createParallelCache<"g", object | undefined>({
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
}

function completeAll(cache: ReturnType<typeof makeCache>) {
  const ids = sent.map(({ queryId }) => queryId);
  sent = [];
  for (const id of ids) cache.markQueryComplete(id);
}

const tileIdxs = () => sent.map(({ tileIdx }) => tileIdx).sort((a, b) => a - b);

beforeEach(() => {
  sent = [];
  store.set(socketStateAtom, SocketState.Connected);
});

describe("prefetchWorld", () => {
  it("fetches every world tile once", () => {
    const cache = makeCache();
    cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([0, 1, 2, 3]);

    sent = [];
    cache.prefetchWorld([0n, 3_505n], "g", bucketNs, undefined);
    expect(sent).toEqual([]);
  });

  it("skips tiles the visible query already fetched", () => {
    const cache = makeCache();
    cache.queryRange([1_000n, 2_000n], [0n, 3_500n], "g", undefined);
    completeAll(cache);

    cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([0, 2, 3]);
  });

  it("refreshes only the tail tile once per new world end bucket", () => {
    const cache = makeCache();
    cache.prefetchWorld([0n, 3_500n], "g", bucketNs, undefined);
    completeAll(cache);

    // same bucket
    cache.prefetchWorld([0n, 3_509n], "g", bucketNs, undefined);
    expect(sent).toEqual([]);

    cache.prefetchWorld([0n, 3_510n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([3]);
    const inFlight = sent;

    sent = [];
    cache.prefetchWorld([0n, 3_520n], "g", bucketNs, undefined);
    expect(sent).toEqual([]);

    // world crosses into a new tile; the old tail is settled
    sent = inFlight;
    completeAll(cache);
    cache.prefetchWorld([0n, 4_100n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([3, 4]);
    completeAll(cache);
    cache.prefetchWorld([0n, 4_110n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([4]);
  });

  it("refetches with new params after clearCache", () => {
    const cache = makeCache();
    const params = { tiles: [1] };
    cache.prefetchWorld([0n, 1_500n], "g", bucketNs, params);
    completeAll(cache);

    cache.clearCache();
    const newParams = { tiles: [2] };
    cache.prefetchWorld([0n, 1_500n], "g", bucketNs, newParams);
    expect(tileIdxs()).toEqual([0, 1]);
    expect(sent.every((s) => s.params === newParams)).toBe(true);
  });

  it("waits for a connection and resends tiles dropped on disconnect", () => {
    const cache = makeCache();
    const unsub = cache.init();

    store.set(socketStateAtom, SocketState.Disconnected);
    cache.prefetchWorld([0n, 1_500n], "g", bucketNs, undefined);
    expect(sent).toEqual([]);

    store.set(socketStateAtom, SocketState.Connected);
    cache.prefetchWorld([0n, 1_500n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([0, 1]);

    sent = [];
    store.set(socketStateAtom, SocketState.Disconnected);
    store.set(socketStateAtom, SocketState.Connected);
    cache.prefetchWorld([0n, 1_500n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([0, 1]);
    unsub();
  });

  it("skips tiles the server has evicted", () => {
    const cache = makeCache();
    cache.prefetchWorld([0n, 2_500n], "g", bucketNs, undefined);
    const tail = sent.find(({ tileIdx }) => tileIdx === 2);
    cache.markQueryComplete(tail!.queryId, undefined, 1_500n);

    sent = [];
    cache.clearPending();
    cache.prefetchWorld([0n, 2_500n], "g", bucketNs, undefined);
    expect(tileIdxs()).toEqual([1, 2]);
  });
});
