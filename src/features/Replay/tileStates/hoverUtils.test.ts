import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultStore } from "jotai";
import { tilesAtom } from "../../../api/atoms";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import { sendMessage } from "../../../api/worker/useWsWorker";
import { createMessageHandler } from "../../../api/worker/messageHandler";
import type { WsEntity } from "../../../api/worker/types";
import { TileState, TileStatesGranularityEnum } from "../../../api/entities";
import type { TimelineTileStates } from "../../../api/types";
import { tileStatesCaches, tileStatesRequests } from "./tileStatesCache";
import { getTileRows, tileStatesTileNs } from "./consts";
import {
  findBatchSlotAtCursor,
  findExecrpHoverAtCursor,
  getTxnStateDurations,
} from "./hoverUtils";
import {
  createRandom,
  createResponse,
  createTestRendererObj,
  getRequest,
  testTiles,
  type TestState,
} from "./tileStatesTestData";
import { setStartupTimeAtom } from "../resetReplayState";

vi.mock("../../../api/worker/useWsWorker", () => ({ sendMessage: vi.fn() }));

const store = getDefaultStore();
const ms = 1_000_000;
const TILE_NS = tileStatesTileNs.txn;
const TILE_MS = Number(TILE_NS) / ms;
const cache = tileStatesCaches.txn;
const SLOT = 10;
const TXN_IDX = 3;
// execrp tile
const TILE = 0;
// just before the second data tile, so a search reaches both
const BASE_MS = TILE_MS - 2;

let requests: { id: number; startNs: bigint }[];

/** Answers the request starting at startNs through the worker merge */
async function respondTo(startNs: bigint, res: TimelineTileStates) {
  await vi.waitFor(
    () =>
      expect(requests.some((request) => request.startNs === startNs)).toBe(
        true,
      ),
    { interval: 1 },
  );
  const { id } = getRequest(requests, startNs);
  const handler = createMessageHandler(() => {});
  handler.onMessage({ topic: "summary", key: "tiles", value: testTiles });
  const item = { topic: "timeline", key: "query_tile_states", id, value: res };
  handler.onMessage(item as WsEntity);
  tileStatesRequests.resolve(id, { value: item.value });
}

/** Caches a data tile from a response, through the worker merge and the cache */
async function cacheResponse(tileId: number, res: TimelineTileStates) {
  const tileStartNs = BigInt(tileId) * TILE_NS;
  cache.requestRange([tileStartNs, tileStartNs + TILE_NS - 1n], 100n * TILE_NS);
  await respondTo(tileStartNs, res);
  await vi.waitFor(
    () =>
      expect(
        cache.getTiles().some(({ startNs }) => startNs === tileStartNs),
      ).toBe(true),
    { interval: 1 },
  );
}

interface Segment {
  // back to back [state, startMs, endMs]
  states: [TileState, number, number][];
  errorCode?: number | null;
  isTxn?: boolean;
  lthashSlotDelta?: number;
}

/** A data tile's response with segments of the execrp tile, idle between */
function txnResponse(
  tileId: number,
  segments: Segment[],
  chunkDurNs = TILE_NS,
): TimelineTileStates {
  const tileStartNs = BigInt(tileId) * TILE_NS;
  const firstMs = segments[0].states[0][1];
  const state: number[] = [];
  const dur: number[] = [];
  const txnStateLo: number[] = [];
  const lthash = { lo: [] as number[], delta: [] as number[] };
  const txns = segments.filter(({ isTxn = true }) => isTxn);
  let endMs = firstMs;
  for (const segment of segments) {
    const { states } = segment;
    if (states[0][1] > endMs) {
      state.push(TileState.Idle);
      dur.push(Math.round((states[0][1] - endMs) * ms));
    }
    if (txns.includes(segment)) txnStateLo.push(state.length);
    if (segment.lthashSlotDelta !== undefined) {
      lthash.lo.push(state.length);
      lthash.delta.push(segment.lthashSlotDelta);
    }
    for (const [tileState, startMs, stateEndMs] of states) {
      state.push(tileState);
      dur.push(Math.round((stateEndMs - startMs) * ms));
      endMs = stateEndMs;
    }
  }
  return {
    granularity: TileStatesGranularityEnum.txn,
    available_start_ns: 0n,
    available_end_ns: 100n * TILE_NS,
    chunks: [
      {
        chunk_ts: tileStartNs,
        chunk_dur: chunkDurNs,
        start_ts: tileStartNs,
        tile_start_ts_delta: Float64Array.from([
          Math.round(firstMs * ms) - Number(tileStartNs),
        ]),
        reference_slot: SLOT,
        tile: [TILE],
        state_cnt: Int32Array.from([state.length]),
        state: Int32Array.from(state),
        dur: Float64Array.from(dur),
        slot_state_lo: new Int32Array(0),
        slot_state_cnt: new Int32Array(0),
        slot_delta: new Int32Array(0),
        txn_state_lo: Int32Array.from(txnStateLo),
        txn_state_cnt: Int32Array.from(txns.map((s) => s.states.length)),
        txn_slot_delta: Int32Array.from(txns.map(() => 0)),
        txn_idx: Int32Array.from(txns.map(() => TXN_IDX)),
        txn_error_code: Float64Array.from(
          txns.map(({ errorCode = 0 }) => errorCode ?? NaN),
        ),
        lthash_state_lo: Int32Array.from(lthash.lo),
        lthash_slot_delta: Int32Array.from(lthash.delta),
      },
    ],
  };
}

/** The txn's states from the data tiles cached for each segment list */
async function getDurations(...tilesSegments: Segment[][]) {
  for (const [tileId, segments] of tilesSegments.entries()) {
    await cacheResponse(tileId, txnResponse(tileId, segments));
  }
  return getTxnStateDurations(SLOT, TXN_IDX, BASE_MS);
}

const at = (
  state: TileState,
  startMs: number,
  endMs: number,
): [TileState, number, number] => [state, BASE_MS + startMs, BASE_MS + endMs];

beforeEach(() => {
  requests = [];
  vi.mocked(sendMessage).mockImplementation((message) => {
    const { id, params } = message as {
      id: number;
      params: { start_ns: string };
    };
    requests.push({ id, startNs: BigInt(params.start_ns) });
  });
  store.set(socketStateAtom, SocketState.Connected);
  store.set(setStartupTimeAtom, 0n);
  store.set(tilesAtom, testTiles);
  cache.reset();
});

afterEach(() => {
  cache.reset();
  vi.restoreAllMocks();
});

describe("getTxnStateDurations", () => {
  it("keeps every state from overlapping fragments, counting overlap once", async () => {
    const exec = (
      await getDurations(
        [
          {
            states: [at(TileState.Loading, 0, 1), at(TileState.Execute, 1, 3)],
          },
        ],
        [
          {
            states: [
              at(TileState.Execute, 1, 3),
              at(TileState.PostExecute, 3, 4),
            ],
          },
        ],
      )
    )?.exec;

    expect(exec?.startMs).toBeCloseTo(BASE_MS, 6);
    expect(exec?.endMs).toBeCloseTo(BASE_MS + 4, 6);
    const stateMs = Object.fromEntries(exec?.stateMs ?? []);
    expect(Object.keys(stateMs).map(Number).sort()).toEqual([
      TileState.Loading,
      TileState.Execute,
      TileState.PostExecute,
    ]);
    expect(stateMs[TileState.Loading]).toBeCloseTo(1, 6);
    expect(stateMs[TileState.Execute]).toBeCloseTo(2, 6);
    expect(stateMs[TileState.PostExecute]).toBeCloseTo(1, 6);
  });

  it("sums a state split across disjoint fragments", async () => {
    const exec = (
      await getDurations(
        [{ states: [at(TileState.Execute, 0, 2)] }],
        [{ states: [at(TileState.Execute, 2, 5)] }],
      )
    )?.exec;

    expect(exec?.stateMs.get(TileState.Execute)).toBeCloseTo(5, 6);
  });

  it("counts a partially overlapping state once", async () => {
    const exec = (
      await getDurations(
        [{ states: [at(TileState.Execute, 0, 3)] }],
        [{ states: [at(TileState.Execute, 2, 5)] }],
      )
    )?.exec;

    expect(exec?.stateMs.get(TileState.Execute)).toBeCloseTo(5, 6);
  });

  it("splits sigverify from execution and keeps the latest error code", async () => {
    const states = await getDurations(
      [
        { states: [at(TileState.Sigverify, 0, 1)], errorCode: 0 },
        { states: [at(TileState.Execute, 2, 4)], errorCode: null },
      ],
      [{ states: [at(TileState.Execute, 3, 5)], errorCode: 7 }],
    );

    expect(states?.sigverify?.stateMs.get(TileState.Sigverify)).toBeCloseTo(
      1,
      6,
    );
    expect(states?.exec?.stateMs.get(TileState.Execute)).toBeCloseTo(3, 6);
    expect(states?.exec?.errorCode).toBe(7);
  });

  it("returns undefined when the txn isn't loaded", async () => {
    await cacheResponse(
      0,
      txnResponse(0, [{ states: [at(TileState.Execute, 0, 1)] }]),
    );
    expect(getTxnStateDurations(SLOT, TXN_IDX + 1, BASE_MS)).toBeUndefined();
  });
});

describe("findExecrpHoverAtCursor on txns", () => {
  // A txn's states from the raw response, as the column parse kept them: the
  // stage at a point inside one, and each state's total time
  function expectLikeRawStates(states: TestState[], tileStartMs: number) {
    const rendererObj = createTestRendererObj("execrp", "txn");
    rendererObj.renderedGranularity = "txn";
    const rows = getTileRows(testTiles, "execrp");
    const visibleRangeMs: [number, number] = [
      tileStartMs,
      tileStartMs + TILE_MS,
    ];
    const [{ data }] = cache.getTiles();
    let checked = 0;
    for (let i = 0; i < data.txn_idx.length; i += 7) {
      const tileIdx = data.txn_tile[i];
      const startMs = data.txn_start_ms[i];
      const endMs = data.txn_end_ms[i];
      const inTxn = states.filter(
        (state) =>
          state.tileIdx === tileIdx &&
          tileStartMs + state.startNs / ms >= startMs - 1e-6 &&
          tileStartMs + state.endNs / ms <= endMs + 1e-6,
      );
      const hovered = inTxn.find(
        ({ startNs, endNs }) => endNs - startNs > 5_000,
      );
      if (!hovered) continue;
      const cursorMs = tileStartMs + (hovered.startNs + hovered.endNs) / 2 / ms;
      const row = rows.findIndex((tile) => tile.tileIdx === tileIdx);
      const txn = findExecrpHoverAtCursor(rendererObj, visibleRangeMs, {
        fracX: (cursorMs - visibleRangeMs[0]) / TILE_MS,
        fracY: (row + 0.95) / rows.length,
        widthPx: 1_000_000,
      })?.txn;
      expect(txn?.txnIdx).toBe(data.txn_idx[i]);
      expect(txn?.state).toBe(hovered.state);

      const segment = txn?.states.exec ?? txn?.states.sigverify;
      const rawMs = new Map<TileState, number>();
      for (const { state, startNs, endNs } of inTxn) {
        rawMs.set(state, (rawMs.get(state) ?? 0) + (endNs - startNs) / ms);
      }
      for (const [state, totalMs] of rawMs) {
        expect(segment?.stateMs.get(state)).toBeCloseTo(totalMs, 6);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  }

  it("finds the stage and state times of the column parse", async () => {
    for (const seed of [1, 2]) {
      cache.reset();
      requests = [];
      const { res, states } = createResponse(createRandom(seed), {
        granularity: "txn",
        startNs: TILE_NS,
        chunkCount: 1,
        chunkNs: Number(TILE_NS),
        stateNs: 1_000_000,
        idleChance: 0.3,
      });
      // one slot and txn index per segment, so txns don't share them
      for (const chunk of res.chunks) {
        chunk.txn_slot_delta = chunk.txn_slot_delta.map(
          (_, segmentIdx) => segmentIdx,
        );
      }
      await cacheResponse(1, res);
      expectLikeRawStates(states, TILE_MS);
    }
  });
});

describe("hover at a txn's edge and on the live tile", () => {
  function hoverAt(cursorMs: number) {
    const rendererObj = createTestRendererObj("execrp", "txn");
    rendererObj.renderedGranularity = "txn";
    const rows = getTileRows(testTiles, "execrp");
    const row = rows.findIndex(({ tileIdx }) => tileIdx === TILE);
    return findExecrpHoverAtCursor(
      rendererObj,
      [cursorMs - 50, cursorMs + 50],
      {
        fracX: 0.5,
        fracY: (row + 0.95) / rows.length,
        widthPx: 2800,
      },
    )?.txn;
  }

  it("leaves out a state ending exactly where the txn starts", async () => {
    for (let k = 0; k < 100; k++) {
      cache.reset();
      requests = [];
      // whole ns, at varied offsets so float error shows at some
      const txnStartMs = TILE_MS + 0.250001 + k * 0.137003;
      await cacheResponse(
        1,
        txnResponse(1, [
          {
            states: [[TileState.Lthash, txnStartMs - 0.25, txnStartMs]],
            isTxn: false,
          },
          {
            states: [
              [TileState.Loading, txnStartMs, txnStartMs + 0.25],
              [TileState.Execute, txnStartMs + 0.25, txnStartMs + 0.5],
            ],
          },
        ]),
      );

      // in the LtHash state, within the hover tolerance of the txn
      const txn = hoverAt(txnStartMs - 0.01);
      expect(txn?.txnIdx).toBe(TXN_IDX);
      expect(txn?.state).toBe(TileState.Loading);
      expect([...(txn?.states.exec?.stateMs.keys() ?? [])].sort()).toEqual([
        TileState.Loading,
        TileState.Execute,
      ]);
    }
  });

  it("finds a txn on the live tile", async () => {
    const tileStartMs = 5 * TILE_MS;
    const segment: Segment = {
      states: [
        [TileState.Loading, tileStartMs + 10, tileStartMs + 20],
        [TileState.Execute, tileStartMs + 20, tileStartMs + 50],
      ],
    };
    // the tile before is still pending, so live finishes it first
    const worldEndNs = 5n * TILE_NS + 500_000_000n;
    cache.requestRange([5n * TILE_NS, worldEndNs], worldEndNs);
    await respondTo(
      4n * TILE_NS,
      txnResponse(4, [{ ...segment, isTxn: false }]),
    );
    await respondTo(5n * TILE_NS, txnResponse(5, [segment], 100_000_000n));
    await vi.waitFor(() =>
      expect(getTxnStateDurations(SLOT, TXN_IDX, tileStartMs)).toBeDefined(),
    );
    expect(cache.getTiles().map(({ startNs }) => startNs)).toEqual([
      4n * TILE_NS,
    ]);

    const txn = hoverAt(tileStartMs + 15);
    expect(txn?.state).toBe(TileState.Loading);
    expect(txn?.states.exec?.stateMs.get(TileState.Loading)).toBeCloseTo(10, 6);
    expect(txn?.states.exec?.stateMs.get(TileState.Execute)).toBeCloseTo(30, 6);
  });
});

describe("findExecrpHoverAtCursor on LtHash tasks", () => {
  beforeEach(() => {
    cache.reset();
    requests = [];
  });

  function hoverAt(cursorMs: number) {
    const rendererObj = createTestRendererObj("execrp", "txn");
    rendererObj.renderedGranularity = "txn";
    const rows = getTileRows(testTiles, "execrp");
    const row = rows.findIndex(({ tileIdx }) => tileIdx === TILE);
    return findExecrpHoverAtCursor(
      rendererObj,
      [cursorMs - 50, cursorMs + 50],
      {
        fracX: 0.5,
        fracY: (row + 0.95) / rows.length,
        widthPx: 2800,
      },
    )?.lthash;
  }

  it("finds the LtHash task and its slot", async () => {
    await cacheResponse(
      0,
      txnResponse(0, [
        { states: [at(TileState.Execute, -2, -1)] },
        {
          states: [at(TileState.Lthash, -0.5, 0.5)],
          isTxn: false,
          lthashSlotDelta: 2,
        },
      ]),
    );

    const lthash = hoverAt(BASE_MS);
    expect(lthash?.slot).toBe(SLOT + 2);
    expect(lthash?.tileIdx).toBe(TILE);
    expect(lthash?.startMs).toBeCloseTo(BASE_MS - 0.5, 6);
    expect(lthash?.endMs).toBeCloseTo(BASE_MS + 0.5, 6);
    expect(hoverAt(BASE_MS - 1.5)).toBeUndefined();
  });

  it("prefers a direct hit over a nearby txn, either way", async () => {
    await cacheResponse(
      0,
      txnResponse(0, [
        {
          states: [at(TileState.Lthash, -0.05, 0)],
          isTxn: false,
          lthashSlotDelta: 1,
        },
        { states: [at(TileState.Execute, 0, 0.05)] },
      ]),
    );

    // each is within the hover tolerance of the other
    expect(hoverAt(BASE_MS - 0.025)?.slot).toBe(SLOT + 1);
    expect(hoverAt(BASE_MS + 0.025)).toBeUndefined();
  });

  it("keeps back to back tasks of a slot apart", async () => {
    const lthash = { isTxn: false, lthashSlotDelta: 1 };
    await cacheResponse(
      0,
      txnResponse(0, [
        { ...lthash, states: [at(TileState.Lthash, -1, -0.5)] },
        { ...lthash, states: [at(TileState.Lthash, -0.5, 0.5)] },
      ]),
    );

    const first = hoverAt(BASE_MS - 0.75);
    expect(first?.startMs).toBeCloseTo(BASE_MS - 1, 6);
    expect(first?.endMs).toBeCloseTo(BASE_MS - 0.5, 6);
    const second = hoverAt(BASE_MS);
    expect(second?.startMs).toBeCloseTo(BASE_MS - 0.5, 6);
    expect(second?.endMs).toBeCloseTo(BASE_MS + 0.5, 6);
  });

  it("finds a task crossing into the next data tile from before the edge", async () => {
    await cacheResponse(
      0,
      txnResponse(0, [{ states: [at(TileState.Execute, -2, -1)] }]),
    );
    // stored only in the later data tile, starting before its edge
    await cacheResponse(
      1,
      txnResponse(1, [
        {
          states: [[TileState.Lthash, TILE_MS - 0.5, TILE_MS + 0.5]],
          isTxn: false,
          lthashSlotDelta: 3,
        },
      ]),
    );

    const lthash = hoverAt(TILE_MS - 0.25);
    expect(lthash?.slot).toBe(SLOT + 3);
    expect(lthash?.startMs).toBeCloseTo(TILE_MS - 0.5, 6);
    expect(lthash?.endMs).toBeCloseTo(TILE_MS + 0.5, 6);
  });
});

describe("findBatchSlotAtCursor", () => {
  const batchCache = tileStatesCaches.txn_batch;
  const BATCH_TILE_NS = tileStatesTileNs.txn_batch;

  afterEach(() => batchCache.reset());

  /** A batch data tile with back to back [state, startMs, endMs, slot] */
  function batchResponse(
    states: [TileState, number, number, number][],
    tileStartNs = 0n,
  ): TimelineTileStates {
    const firstMs = states[0][1] - Number(tileStartNs) / ms;
    return {
      granularity: TileStatesGranularityEnum.txn_batch,
      available_start_ns: 0n,
      available_end_ns: 100n * BATCH_TILE_NS,
      chunks: [
        {
          chunk_ts: tileStartNs,
          chunk_dur: BATCH_TILE_NS,
          start_ts: tileStartNs,
          tile_start_ts_delta: Float64Array.from([Math.round(firstMs * ms)]),
          reference_slot: SLOT,
          tile: [TILE],
          state_cnt: Int32Array.from([states.length]),
          state: Int32Array.from(states.map(([state]) => state)),
          dur: Float64Array.from(
            states.map(([, startMs, endMs]) =>
              Math.round((endMs - startMs) * ms),
            ),
          ),
          slot_state_lo: Int32Array.from(states.map((_, i) => i)),
          slot_state_cnt: Int32Array.from(states.map(() => 1)),
          slot_delta: Int32Array.from(
            states.map(([, , , slot]) => slot - SLOT),
          ),
          txn_state_lo: new Int32Array(0),
          txn_state_cnt: new Int32Array(0),
          txn_slot_delta: new Int32Array(0),
          txn_idx: new Int32Array(0),
          txn_error_code: new Float64Array(0),
          lthash_state_lo: new Int32Array(0),
          lthash_slot_delta: new Int32Array(0),
        },
      ],
    };
  }

  function hoverAt(cursorMs: number) {
    const rendererObj = createTestRendererObj("execrp", "txn_batch");
    rendererObj.renderedGranularity = "txn_batch";
    const rows = getTileRows(testTiles, "execrp");
    const row = rows.findIndex(({ tileIdx }) => tileIdx === TILE);
    return findBatchSlotAtCursor(rendererObj, [cursorMs - 50, cursorMs + 50], {
      fracX: 0.5,
      fracY: (row + 0.95) / rows.length,
      widthPx: 2800,
    });
  }

  it("finds the slot of the batch under the cursor, not the slot at its ms", async () => {
    batchCache.requestRange([0n, BATCH_TILE_NS - 1n], 100n * BATCH_TILE_NS);
    // replaying older slots while newer ones overlap them in time
    await respondTo(
      0n,
      batchResponse([
        [TileState.ExecBatch, 10, 20, SLOT + 5],
        [TileState.ExecBatch, 20, 30, SLOT + 2],
        [TileState.LthashBatch, 30, 40, SLOT + 7],
      ]),
    );
    await vi.waitFor(() => expect(batchCache.getTiles()).toHaveLength(1));

    expect(hoverAt(15)).toBe(SLOT + 5);
    expect(hoverAt(25)).toBe(SLOT + 2);
    expect(hoverAt(35)).toBe(SLOT + 7);
    // beyond the hover tolerance of any batch
    expect(hoverAt(500)).toBeUndefined();
  });

  it("finds a batch starting before the data tile that owns it", async () => {
    const tileStartNs = BATCH_TILE_NS;
    const tileStartMs = Number(tileStartNs) / ms;
    batchCache.requestRange(
      [tileStartNs, tileStartNs + BATCH_TILE_NS - 1n],
      100n * BATCH_TILE_NS,
    );
    await respondTo(
      tileStartNs,
      batchResponse(
        [[TileState.ExecBatch, tileStartMs - 100, tileStartMs + 100, SLOT + 4]],
        tileStartNs,
      ),
    );
    await vi.waitFor(() => expect(batchCache.getTiles()).toHaveLength(1));

    // the previous data tile isn't cached
    expect(hoverAt(tileStartMs - 50)).toBe(SLOT + 4);
    expect(hoverAt(tileStartMs + 50)).toBe(SLOT + 4);
    expect(hoverAt(tileStartMs - 500)).toBeUndefined();
  });
});
