import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { startupTimeAtom, tilesAtom } from "../../../api/atoms";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import { sendMessage } from "../../../api/worker/useWsWorker";
import { createMessageHandler } from "../../../api/worker/messageHandler";
import type { WsEntity } from "../../../api/worker/types";
import {
  TileState,
  TileStatesGranularityEnum,
  tileStatesResponseSchema,
} from "../../../api/entities";
import type { Tile, TimelineTileStates } from "../../../api/types";
import { smoothedNowNsAtom } from "../../../nowAtoms";
import {
  tileStatesCaches,
  tileStatesRequests,
  type TileStatesCacheDelta,
  type TileStatesData,
} from "./tileStatesCache";
import { useTileStatesCache } from "./useTileStatesCache";
import { mergeBinsMs, tileKinds, tileStatesTileNs } from "./consts";
import {
  mergeTileStatesResponse,
  type MergedLevel,
  type MergedTileStatesResponse,
} from "./mergeTileStates";
import { MAX_COVERAGE_STATES } from "./tileStatesRects";
import {
  appendLiveStates,
  clearLiveMarkerIfAdded,
  setVisibleRange,
  syncMeshes,
} from "./utils";
import {
  createRandom,
  createResponse,
  createTestRendererObj,
  getDrawnRects,
  getRequest,
  testTiles,
} from "./tileStatesTestData";

vi.mock("../../../api/worker/useWsWorker", () => ({ sendMessage: vi.fn() }));
vi.mock("../../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const store = getDefaultStore();
const ms = 1_000_000;
const GRANULARITY = "txn";
const TILE_NS = tileStatesTileNs[GRANULARITY];
const TILE_MS = Number(TILE_NS) / ms;
const CHUNK_NS = 100_000_000;
const cache = tileStatesCaches[GRANULARITY];

interface Request {
  id: number;
  startNs: bigint;
  endNs: bigint; // exclusive
}

let requests: Request[];
let perfNow: number;

/**
 * A server holding each data tile's states, answering requests with the
 * final chunks in the window, like the real one
 */
function createServer({
  maxChunks = Infinity,
  resultLimitChunks = Infinity,
  finalEndNs = Infinity,
}) {
  const wholeTiles = new Map<bigint, TimelineTileStates>();
  const getWholeTile = (tileStartNs: bigint) => {
    const cached = wholeTiles.get(tileStartNs);
    if (cached) return cached;
    const { res } = createResponse(
      createRandom(Number(tileStartNs / TILE_NS)),
      {
        granularity: GRANULARITY,
        startNs: tileStartNs,
        chunkCount: Number(TILE_NS) / CHUNK_NS,
        chunkNs: CHUNK_NS,
        stateNs: 50_000,
        idleChance: 0.3,
      },
    );
    wholeTiles.set(tileStartNs, res);
    return res;
  };
  const server = {
    finalEndNs,
    tiles: testTiles as Tile[] | undefined,
    getWholeTile,
    editChunks: (chunks: TimelineTileStates["chunks"]) => chunks,
    respond({ id, startNs, endNs }: Request) {
      const whole = getWholeTile((startNs / TILE_NS) * TILE_NS);
      const inWindow = whole.chunks.filter(
        ({ chunk_ts }) => startNs <= chunk_ts && chunk_ts < endNs,
      );
      if (inWindow.length > resultLimitChunks) {
        tileStatesRequests.resolve(id, { errorCode: "result_limit_exceeded" });
        return;
      }
      const chunks = inWindow
        .filter(
          ({ chunk_ts, chunk_dur }) =>
            Number(chunk_ts + chunk_dur) <= server.finalEndNs,
        )
        .slice(0, maxChunks);
      const handler = createMessageHandler(() => {});
      if (server.tiles) {
        handler.onMessage({
          topic: "summary",
          key: "tiles",
          value: server.tiles,
        });
      }
      const value: MergedTileStatesResponse = {
        ...whole,
        chunks: server.editChunks(chunks),
      };
      handler.onMessage({
        topic: "timeline",
        key: "query_tile_states",
        id,
        value,
      } as WsEntity);
      tileStatesRequests.resolve(id, { value });
    },
  };
  return server;
}

type Server = ReturnType<typeof createServer>;

async function respondUntil(server: Server, isDone: () => boolean) {
  while (!isDone()) {
    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0));
    const request = requests.shift();
    if (request) server.respond(request);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function getTile(tileStartNs: bigint) {
  return cache.getTiles().find(({ startNs }) => startNs === tileStartNs);
}

type RectKey = string;

/** Each rect as its row, ms from the tile start, absolute slot and shares */
function getRectKeys(level: MergedLevel, referenceSlot: number): RectKey[] {
  const stride = MAX_COVERAGE_STATES + 1;
  return Array.from({ length: level.count }, (_, i) =>
    [
      level.bar[i * stride],
      (level.edges[i * 4] + level.edges[i * 4 + 1]).toFixed(6),
      (level.edges[i * 4 + 2] + level.edges[i * 4 + 3]).toFixed(6),
      referenceSlot + level.slot[i],
      ...level.bar.subarray(i * stride + 1, (i + 1) * stride),
    ].join(" "),
  ).sort();
}

function getStateTimes(level: MergedLevel) {
  const stride = MAX_COVERAGE_STATES + 1;
  const times = new Map<string, number>();
  for (let i = 0; i < level.count; i++) {
    const row = level.bar[i * stride];
    const spanMs =
      level.edges[i * 4 + 2] +
      level.edges[i * 4 + 3] -
      level.edges[i * 4] -
      level.edges[i * 4 + 1];
    for (let state = 0; state < MAX_COVERAGE_STATES; state++) {
      const key = `${row}:${state}`;
      const share = level.bar[i * stride + 1 + state] / (2 ** 16 - 1);
      times.set(key, (times.get(key) ?? 0) + spanMs * share);
    }
  }
  return times;
}

/**
 * A tile cached from several responses has the states of merging it whole,
 * in the levels left after dropping any too close to the last kept one
 */
function expectLikeWholeMerge(data: TileStatesData, whole: TimelineTileStates) {
  const merged = mergeTileStatesResponse(whole, testTiles);
  for (const kind of tileKinds) {
    const levels = data.levels[kind];
    const wholeLevels = merged.levels[kind];
    expect(levels[0].binMs).toBe(0);
    expect(levels.length).toBeLessThan(wholeLevels.length);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].count).toBeLessThanOrEqual(levels[i - 1].count * 0.75);
    }
    expect(getRectKeys(levels[0], data.referenceSlot)).toEqual(
      getRectKeys(wholeLevels[0], merged.referenceSlot),
    );
    for (const level of levels) {
      const wholeLevel = wholeLevels.find(({ binMs }) => binMs === level.binMs);
      const wholeTimes = getStateTimes(wholeLevel ?? wholeLevels[0]);
      for (const [key, timeMs] of getStateTimes(level)) {
        expect(timeMs).toBeCloseTo(wholeTimes.get(key) ?? 0, 3);
      }
    }
  }
}

type DrawnRects = ReturnType<typeof getDrawnRects>;

function toBytes(array: ArrayBufferView) {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function expectSameRects(drawn: DrawnRects, expected: DrawnRects) {
  expect(drawn.map(({ binMs }) => binMs)).toEqual(
    expected.map(({ binMs }) => binMs),
  );
  drawn.forEach((level, i) => {
    for (const key of ["edges", "bar", "slot"] as const) {
      const isSame = toBytes(level[key]).equals(toBytes(expected[i][key]));
      expect(isSame, `${key} of level ${level.binMs}`).toBe(true);
    }
  });
}

beforeEach(() => {
  requests = [];
  perfNow = 0;
  vi.spyOn(performance, "now").mockImplementation(() => perfNow);
  vi.mocked(sendMessage).mockImplementation((message) => {
    const { id, params } = message as {
      id: number;
      params: { start_ns: string; end_ns: string };
    };
    requests.push({
      id,
      startNs: BigInt(params.start_ns),
      endNs: BigInt(params.end_ns),
    });
  });
  store.set(socketStateAtom, SocketState.Connected);
  store.set(startupTimeAtom, { startupTimeNanos: 0n } as never);
  store.set(tilesAtom, testTiles);
  store.set(smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>, undefined);
  cache.reset();
});

afterEach(() => {
  cache.reset();
  vi.restoreAllMocks();
});

describe("tile states cache", () => {
  it("gives each state the slot of its slot or txn segment", async () => {
    // tile 5 is an execrp tile and 7 is replay
    const tiles = Array.from({ length: 8 }, (_, kindId) => ({
      kind: kindId === 7 ? "replay" : "execrp",
      kind_id: kindId,
    }));
    cache.requestRange([0n, 1_000n * BigInt(ms)], 100_000n * BigInt(ms));
    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0));
    const { id } = getRequest(requests, 0n);

    // execrp tile 5: an unattributed state, a txn of slot 500, then an LtHash
    // task of slot 502. replay tile 7: two slot states of slot 501.
    const response: TimelineTileStates = {
      granularity: TileStatesGranularityEnum.txn,
      available_start_ns: 0n,
      available_end_ns: TILE_NS,
      chunks: [
        {
          chunk_ts: 0n,
          chunk_dur: TILE_NS,
          start_ts: 0n,
          tile_start_ts_delta: Float64Array.from([0, 0]),
          reference_slot: 500,
          tile: [5, 7],
          state_cnt: Int32Array.from([4, 2]),
          state: Int32Array.from([
            TileState.BlockedOnTiles,
            TileState.Loading,
            TileState.Execute,
            TileState.Lthash,
            TileState.SlotFinish,
            TileState.ExecBatch,
          ]),
          dur: Float64Array.from([ms, ms, ms, ms, ms, ms]),
          slot_state_lo: Int32Array.from([4]),
          slot_state_cnt: Int32Array.from([2]),
          slot_delta: Int32Array.from([1]),
          txn_state_lo: Int32Array.from([1]),
          txn_state_cnt: Int32Array.from([2]),
          txn_slot_delta: Int32Array.from([0]),
          txn_idx: Int32Array.from([0]),
          txn_error_code: Float64Array.from([0]),
          lthash_state_lo: Int32Array.from([3]),
          lthash_slot_delta: Int32Array.from([2]),
        },
      ],
    };
    const handler = createMessageHandler(() => {});
    handler.onMessage({ topic: "summary", key: "tiles", value: tiles });
    const item = {
      topic: "timeline",
      key: "query_tile_states",
      id,
      value: response,
    };
    handler.onMessage(item as WsEntity);
    tileStatesRequests.resolve(id, { value: item.value });
    await vi.waitFor(() => expect(cache.getTiles().length).toBe(1));

    const [{ data }] = cache.getTiles();
    const slots = (kind: "execrp" | "replay") =>
      Array.from(
        data.levels[kind][0].slot,
        (slot) => data.referenceSlot + slot,
      );
    expect(slots("execrp")).toEqual([500, 500, 502]);
    expect(slots("replay")).toEqual([501]);
    expect(data.txn_slot).toEqual([500]);
  });

  it("skips null tiles, unknown states, and reads missing start deltas as 0", () => {
    const response = tileStatesResponseSchema.parse({
      granularity: "txn",
      available_start_ns: null,
      available_end_ns: null,
      chunks: [
        {
          chunk_ts: "0",
          chunk_dur: String(CHUNK_NS),
          start_ts: "0",
          tile_start_ts_delta: [null, null],
          reference_slot: 10,
          tile: [null, 0],
          state_cnt: [1, 3],
          state: [TileState.Execute, TileState.Execute, 99, TileState.Loading],
          dur: [ms, ms, ms, ms],
          slot_state_lo: [],
          slot_state_cnt: [],
          slot_delta: [],
          txn_state_lo: [],
          txn_state_cnt: [],
          txn_slot_delta: [],
          txn_idx: [],
          txn_error_code: [],
          lthash_state_lo: [],
          lthash_slot_delta: [],
        },
      ],
    });
    const { levels } = mergeTileStatesResponse(response, testTiles);
    const [raw] = levels.execrp;
    expect(raw.count).toBe(2);
    expect(Array.from(raw.edges.filter((_, i) => i % 2 === 0))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("caches a tile fetched in several responses like merging it whole", async () => {
    const server = createServer({ maxChunks: 7 });
    const tileStartNs = 4n * TILE_NS;
    cache.requestRange(
      [tileStartNs, tileStartNs + TILE_NS - 1n],
      100n * TILE_NS,
    );
    await respondUntil(server, () => !!getTile(tileStartNs));

    const tile = getTile(tileStartNs);
    if (!tile) throw new Error("not cached");
    expectLikeWholeMerge(tile.data, server.getWholeTile(tileStartNs));
  });

  it("splits a window past the result limit through the tile's end", async () => {
    const server = createServer({ resultLimitChunks: 12 });
    const tileStartNs = 6n * TILE_NS;
    cache.requestRange(
      [tileStartNs, tileStartNs + TILE_NS - 1n],
      100n * TILE_NS,
    );
    await respondUntil(server, () => !!getTile(tileStartNs));

    const tile = getTile(tileStartNs);
    if (!tile) throw new Error("not cached");
    expectLikeWholeMerge(tile.data, server.getWholeTile(tileStartNs));
  });

  it("follows a live tile to its end, drawing it like building it whole", async () => {
    const tileStartNs = 10n * TILE_NS;
    const viewNs: [bigint, bigint] = [tileStartNs, tileStartNs + TILE_NS - 1n];
    const server = createServer({ finalEndNs: Number(tileStartNs) + 350 * ms });
    const live = createTestRendererObj("execrp", GRANULARITY);
    setVisibleRange(live, [
      Number(tileStartNs) / ms,
      Number(tileStartNs) / ms + TILE_MS,
    ]);
    const liveDraws: [DrawnRects, DrawnRects][] = [];
    // what useTileStatesRenderer does with live and added tiles
    const unsubscribe = cache.subscribe((delta: TileStatesCacheDelta) => {
      if (delta.kind === "live" && delta.tile.startNs === tileStartNs) {
        appendLiveStates(live, delta.tile, delta.newData, delta.isNewTile);
        const whole = createTestRendererObj("execrp", GRANULARITY);
        setVisibleRange(whole, [0, TILE_MS]);
        appendLiveStates(whole, delta.tile, delta.tile.data, true);
        liveDraws.push([
          getDrawnRects(live, delta.tile.startNs),
          getDrawnRects(whole, delta.tile.startNs),
        ]);
      } else if (delta.kind === "add") {
        clearLiveMarkerIfAdded(live, delta.tiles);
        syncMeshes(live);
      }
    });

    for (let step = 0; step < 20 && !getTile(tileStartNs); step++) {
      cache.requestRange(viewNs, BigInt(server.finalEndNs) - 1n);
      while (requests.length) {
        const request = requests.shift();
        if (request) server.respond(request);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      perfNow += 200;
      server.finalEndNs += 450 * ms;
    }
    unsubscribe();

    expect(liveDraws.length).toBeGreaterThan(2);
    for (const [liveRects, wholeRects] of liveDraws) {
      expectSameRects(liveRects, wholeRects);
    }
    const tile = getTile(tileStartNs);
    if (!tile) throw new Error("not cached");
    expectLikeWholeMerge(tile.data, server.getWholeTile(tileStartNs));

    // once cached, the tile shows the cache's kept levels, not live copies
    const cached = createTestRendererObj("execrp", GRANULARITY);
    setVisibleRange(cached, [0, TILE_MS]);
    syncMeshes(cached);
    expectSameRects(
      getDrawnRects(live, tileStartNs),
      getDrawnRects(cached, tileStartNs),
    );
    const [liveMeshes] = [...live.dataTileMeshes.values()].filter(
      ({ startMs }) => startMs === Number(tileStartNs) / ms,
    );
    tile.data.levels.execrp.forEach(({ edges }, i) => {
      expect(liveMeshes.levels[i].mesh.edges).toBe(edges);
    });
  });

  it("takes the reference slot of the first response that has one", async () => {
    const server = createServer({ maxChunks: 5 });
    // the first response's chunks have no slots
    server.editChunks = (chunks) =>
      chunks.map((chunk) =>
        chunk.chunk_ts < 12n * TILE_NS + 500n * BigInt(ms)
          ? {
              ...chunk,
              reference_slot: null,
              slot_state_lo: new Int32Array(0),
              slot_state_cnt: new Int32Array(0),
              slot_delta: new Int32Array(0),
              txn_state_lo: new Int32Array(0),
              txn_state_cnt: new Int32Array(0),
              txn_slot_delta: new Int32Array(0),
              txn_idx: new Int32Array(0),
              txn_error_code: new Float64Array(0),
              lthash_state_lo: new Int32Array(0),
              lthash_slot_delta: new Int32Array(0),
            }
          : chunk,
      );
    const tileStartNs = 12n * TILE_NS;
    cache.requestRange(
      [tileStartNs, tileStartNs + TILE_NS - 1n],
      100n * TILE_NS,
    );
    await respondUntil(server, () => !!getTile(tileStartNs));

    const tile = getTile(tileStartNs);
    if (!tile) throw new Error("not cached");
    const later = { ...server.getWholeTile(tileStartNs) };
    later.chunks = later.chunks.filter(
      ({ chunk_ts }) => chunk_ts >= tileStartNs + 500n * BigInt(ms),
    );
    const merged = mergeTileStatesResponse(later, testTiles);
    expect(tile.data.referenceSlot).toBe(merged.referenceSlot);
    const slots = (level: MergedLevel, referenceSlot: number) =>
      Array.from(level.slot, (slot) => referenceSlot + slot).filter(
        (slot) => !Number.isNaN(slot),
      );
    expect(slots(tile.data.levels.execrp[0], tile.data.referenceSlot)).toEqual(
      slots(merged.levels.execrp[0], merged.referenceSlot),
    );
  });

  it("drops a response that arrives after a reset", async () => {
    const server = createServer({});
    const tileStartNs = 14n * TILE_NS;
    cache.requestRange(
      [tileStartNs, tileStartNs + TILE_NS - 1n],
      100n * TILE_NS,
    );
    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0));
    const stale = getRequest(requests, tileStartNs);

    cache.reset();
    server.respond(stale);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cache.getTiles()).toEqual([]);
    expect(
      cache.getDataInRange(tileStartNs, tileStartNs + TILE_NS).data,
    ).toEqual([]);
  });

  it("merges nothing before the tile list, and refetches once it changes", async () => {
    const server = createServer({});
    server.tiles = undefined;
    const tileStartNs = 16n * TILE_NS;
    cache.requestRange(
      [tileStartNs, tileStartNs + TILE_NS - 1n],
      100n * TILE_NS,
    );
    await respondUntil(server, () => !!getTile(tileStartNs));
    const levels = getTile(tileStartNs)?.data.levels;
    for (const kind of tileKinds) {
      expect(levels?.[kind].map(({ count }) => count)).toEqual(
        mergeBinsMs[GRANULARITY].map(() => 0),
      );
    }

    const reset = vi.spyOn(cache, "reset");
    renderHook(() => useTileStatesCache());
    store.set(tilesAtom, [...testTiles, { kind: "execrp", kind_id: 3 }]);
    await vi.waitFor(() => expect(reset).toHaveBeenCalled());
    expect(cache.getTiles()).toEqual([]);
  });
});
