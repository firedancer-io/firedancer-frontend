import { describe, it, expect, beforeEach, vi } from "vitest";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import {
  createTileCache,
  type TileCacheConfig,
  type TileCacheDelta,
} from "./cache";
import type { Interval } from "./splitFetch";
import { getChunksEndNs } from "../utils";
import { bigIntMin } from "../../../mathUtils";
import { smoothedNowNsAtom } from "../../../nowAtoms";

vi.mock("../../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const msNs = 1_000_000n;
const tileNs = 4_000n * msNs;
const chunkNs = 100n * msNs;

let finalEndNs: bigint;
let maxChunks: number;
let fetchedWindows: Interval[];
let deltas: TileCacheDelta<Interval[], null>[];
let perfNow: number;
let heldResponses: ((errorCode?: string) => void)[] | null;

// Like the server: aligned chunks, only final ones, capped per response
function getChunks([startNs, endNs]: Interval) {
  const chunks = [];
  for (
    let chunkTs = (startNs / chunkNs) * chunkNs;
    chunkTs <= endNs &&
    chunkTs + chunkNs <= finalEndNs &&
    chunks.length < maxChunks;
    chunkTs += chunkNs
  ) {
    chunks.push({ chunk_ts: chunkTs, chunk_dur: chunkNs });
  }
  return chunks;
}

function createCache(
  overrides: Partial<TileCacheConfig<Interval[], null>> = {},
) {
  const cache = createTileCache<Interval[], null>({
    tileNs,
    minSubTileNs: msNs,
    maxItems: 1_000,
    maxTiles: 100,
    empty: () => [],
    merge: (acc, add) => acc.push(...add),
    itemCount: (data) => data.length,
    deriveMeta: () => null,
    fetch: (window) => {
      fetchedWindows.push(window);
      const chunksEndNs = getChunksEndNs(getChunks(window));
      const result = {
        value:
          chunksEndNs === undefined
            ? []
            : [[window[0], bigIntMin(chunksEndNs - 1n, window[1])] as Interval],
        chunksEndNs,
      };
      const held = heldResponses;
      if (!held) return Promise.resolve(result);
      return new Promise((resolve) =>
        held.push((errorCode) => resolve(errorCode ? { errorCode } : result)),
      );
    },
    failPendingRequests: () => {},
    ...overrides,
  });
  cache.subscribe((delta) => deltas.push(delta));
  return cache;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function advanceQueryThrottle() {
  perfNow += 200;
}

describe("tile cache with partial responses", () => {
  beforeEach(() => {
    finalEndNs = 0n;
    maxChunks = Infinity;
    fetchedWindows = [];
    deltas = [];
    perfNow = 0;
    heldResponses = null;
    vi.spyOn(performance, "now").mockImplementation(() => perfNow);
    getDefaultStore().set(socketStateAtom, SocketState.Connected);
    getDefaultStore().set(
      smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
      undefined,
    );
  });

  it("keeps a fully fetched tile as complete returns it", async () => {
    finalEndNs = 10n * tileNs;
    maxChunks = 15;
    const cache = createCache({ complete: (data) => [data[data.length - 1]] });

    cache.requestRange([0n, tileNs - 1n], 9n * tileNs);
    await vi.waitFor(() => expect(cache.getTiles().length).toBeGreaterThan(0));

    expect(cache.getTiles()[0].data).toEqual([[3_000n * msNs, tileNs - 1n]]);
  });

  it("requests the rest of a historical tile until it is complete", async () => {
    finalEndNs = 10n * tileNs;
    maxChunks = 15;
    const cache = createCache();

    cache.requestRange([0n, tileNs - 1n], 9n * tileNs);
    await vi.waitFor(() => expect(cache.getTiles().length).toBe(2));

    expect(cache.getTiles()[0].data).toEqual([
      [0n, 1_500n * msNs - 1n],
      [1_500n * msNs, 3_000n * msNs - 1n],
      [3_000n * msNs, tileNs - 1n],
    ]);
  });

  it("requests every missing tile without waiting for responses", async () => {
    finalEndNs = 20n * tileNs;
    heldResponses = [];
    const cache = createCache();

    cache.requestRange([2n * tileNs, 4n * tileNs - 1n], 20n * tileNs);
    // view tiles first, then overscan, right before left at the same distance
    expect(fetchedWindows.map(([startNs]) => startNs / tileNs)).toEqual([
      3n,
      2n,
      4n,
      1n,
    ]);

    // panning while tiles are in flight requests only the new ones
    cache.requestRange([3n * tileNs, 5n * tileNs - 1n], 20n * tileNs);
    expect(fetchedWindows.map(([startNs]) => startNs / tileNs)).toEqual([
      3n,
      2n,
      4n,
      1n,
      5n,
    ]);

    for (const respond of heldResponses) respond();
    await vi.waitFor(() => expect(cache.getTiles()).toHaveLength(5));
    expect(fetchedWindows).toHaveLength(5);
  });

  it("retries a tile that fails after the view moved on", async () => {
    finalEndNs = 20n * tileNs;
    heldResponses = [];
    const cache = createCache();

    cache.requestRange([2n * tileNs, 3n * tileNs - 1n], 20n * tileNs);
    const [tile2Response] = heldResponses;
    expect(fetchedWindows[0][0]).toBe(2n * tileNs);
    cache.requestRange([2n * tileNs, 4n * tileNs - 1n], 20n * tileNs);
    expect(fetchedWindows).toHaveLength(4);

    tile2Response("timeout");
    await flush();
    expect(fetchedWindows).toHaveLength(5);
    expect(fetchedWindows[4][0]).toBe(2n * tileNs);

    // a failure within the same view isn't retried in a loop
    heldResponses.at(-1)?.("timeout");
    await flush();
    expect(fetchedWindows).toHaveLength(5);

    for (const respond of heldResponses) respond();
    await vi.waitFor(() => expect(cache.getTiles()).toHaveLength(3));
    expect(fetchedWindows).toHaveLength(5);
  });

  it("drops responses from before a reset", async () => {
    finalEndNs = 20n * tileNs;
    heldResponses = [];
    const cache = createCache();
    const viewNs: [bigint, bigint] = [2n * tileNs, 3n * tileNs - 1n];

    cache.requestRange(viewNs, 20n * tileNs);
    const staleResponses = heldResponses;
    cache.reset();
    heldResponses = [];
    cache.requestRange(viewNs, 20n * tileNs);
    expect(fetchedWindows).toHaveLength(6);

    for (const respond of staleResponses) respond();
    await flush();
    expect(cache.getTiles()).toEqual([]);

    for (const respond of heldResponses) respond();
    await vi.waitFor(() => expect(cache.getTiles()).toHaveLength(3));
    expect(fetchedWindows).toHaveLength(6);
  });

  it("fetches the tile before the world end live when it may not be final", async () => {
    const cache = createCache();
    const viewNs: [bigint, bigint] = [tileNs, 2n * tileNs - 1n];

    finalEndNs = tileNs - 500n * msNs;
    cache.requestRange(viewNs, tileNs + 1_000n * msNs);
    await vi.waitFor(() => expect(deltas).toHaveLength(1));
    expect(fetchedWindows).toEqual([[0n, tileNs - 1n]]);
    expect(cache.getTiles()).toEqual([]);

    finalEndNs = tileNs + 500n * msNs;
    advanceQueryThrottle();
    cache.requestRange(viewNs, tileNs + 1_100n * msNs);
    await vi.waitFor(() => expect(cache.getTiles()).toHaveLength(1));
    expect(fetchedWindows[1]).toEqual([tileNs - 500n * msNs, tileNs - 1n]);
    expect(cache.getTiles()[0].data).toEqual([
      [0n, tileNs - 500n * msNs - 1n],
      [tileNs - 500n * msNs, tileNs - 1n],
    ]);
  });

  it("resumes live from the end of the previous response", async () => {
    const cache = createCache();
    const viewNs: [bigint, bigint] = [0n, tileNs - 1n];
    // live also claims the uncached tile before, so only follow tile 0
    const tile0LiveDeltas = () =>
      deltas.filter(
        (delta) => delta.kind === "live" && delta.tile.startNs === 0n,
      );
    const tile0 = () => cache.getTiles().find((tile) => tile.startNs === 0n);

    finalEndNs = 400n * msNs;
    cache.requestRange(viewNs, 750n * msNs);
    await vi.waitFor(() => expect(tile0LiveDeltas()).toHaveLength(1));
    expect(fetchedWindows.at(-1)).toEqual([0n, 750n * msNs]);

    // no new final chunks: nothing published and nothing skipped
    advanceQueryThrottle();
    cache.requestRange(viewNs, 800n * msNs);
    await flush();
    expect(fetchedWindows.at(-1)).toEqual([400n * msNs, 800n * msNs]);
    expect(tile0LiveDeltas()).toHaveLength(1);

    finalEndNs = 900n * msNs;
    advanceQueryThrottle();
    cache.requestRange(viewNs, 950n * msNs);
    await vi.waitFor(() => expect(tile0LiveDeltas()).toHaveLength(2));
    expect(fetchedWindows.at(-1)).toEqual([400n * msNs, 950n * msNs]);

    // world end crosses into the next tile before the first one is final
    advanceQueryThrottle();
    cache.requestRange(viewNs, tileNs + 250n * msNs);
    await vi.waitFor(() => expect(tile0LiveDeltas()).toHaveLength(2));
    await flush();
    expect(fetchedWindows.at(-1)).toEqual([900n * msNs, tileNs - 1n]);
    expect(tile0()).toBeUndefined();

    finalEndNs = tileNs + 200n * msNs;
    advanceQueryThrottle();
    cache.requestRange(viewNs, tileNs + 300n * msNs);
    await vi.waitFor(() => expect(tile0()).toBeDefined());
    expect(tile0()?.data).toEqual([
      [0n, 400n * msNs - 1n],
      [400n * msNs, 900n * msNs - 1n],
      [900n * msNs, tileNs - 1n],
    ]);
    await vi.waitFor(() =>
      expect(fetchedWindows.at(-1)).toEqual([tileNs, tileNs + 300n * msNs]),
    );

    advanceQueryThrottle();
    cache.requestRange(viewNs, tileNs + 400n * msNs);
    await vi.waitFor(() =>
      expect(fetchedWindows.at(-1)).toEqual([
        tileNs + 200n * msNs,
        tileNs + 400n * msNs,
      ]),
    );
  });

  it("requests live data ahead of the world end, up to server now", async () => {
    const cache = createCache();
    getDefaultStore().set(
      smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
      2_000n * msNs,
    );

    finalEndNs = 1_700n * msNs;
    cache.requestRange([0n, tileNs - 1n], 1_500n * msNs);
    await vi.waitFor(() =>
      expect(fetchedWindows.at(-1)).toEqual([0n, 2_000n * msNs]),
    );
    await vi.waitFor(() =>
      expect(
        deltas.findLast(
          (delta) => delta.kind === "live" && delta.tile.startNs === 0n,
        ),
      ).toMatchObject({ newData: [[0n, 1_700n * msNs - 1n]] }),
    );
  });

  it("requests the live tile through its end before the world end crosses it", async () => {
    const cache = createCache();
    getDefaultStore().set(
      smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
      tileNs + 200n * msNs,
    );

    finalEndNs = tileNs + 100n * msNs;
    cache.requestRange([0n, tileNs - 1n], tileNs - 300n * msNs);
    await vi.waitFor(() =>
      expect(fetchedWindows.at(-1)).toEqual([0n, tileNs - 1n]),
    );
    await vi.waitFor(() =>
      expect(
        deltas.findLast(
          (delta) => delta.kind === "live" && delta.tile.startNs === 0n,
        ),
      ).toMatchObject({ newData: [[0n, tileNs - 1n]] }),
    );
  });

  it("reports the live tile as incomplete past its fetched end", async () => {
    const cache = createCache();

    finalEndNs = 400n * msNs;
    cache.requestRange([0n, tileNs - 1n], 750n * msNs);
    await vi.waitFor(() =>
      expect(
        deltas.some(
          (delta) => delta.kind === "live" && delta.tile.startNs === 0n,
        ),
      ).toBe(true),
    );

    expect(cache.getDataInRange(0n, 300n * msNs).hasAllTilesCached).toBe(true);
    expect(cache.getDataInRange(0n, 600n * msNs).hasAllTilesCached).toBe(false);
  });
});
