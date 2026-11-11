import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { startupTimeAtom, tilesAtom } from "../../../api/atoms";
import { isDocumentVisibleAtom } from "../../../atoms";
import { smoothedNowNsAtom } from "../../../nowAtoms";
import { visibleRangeAtom } from "../atoms";
import { useTileStatesRenderer } from "./useTileStatesRenderer";
import {
  tileStatesCaches,
  tileStatesLevels,
  type TileStatesData,
  type TileStatesDataTile,
} from "./tileStatesCache";
import { MAX_COVERAGE_STATES } from "./tileStatesRects";
import { MERGE_BIN_PX, tileStatesTileNs, trackStates } from "./consts";
import { getRelativeSlot, NO_SLOT } from "../slotHighlight";
import {
  mergeTileStatesResponse,
  pruneLevels,
  type MergedLevels,
} from "./mergeTileStates";
import { setVisibleRange, syncMeshes, type RendererObj } from "./utils";
import {
  createRandom,
  createResponse,
  createTestRendererObj,
  testTiles,
} from "./tileStatesTestData";
import { aggTileStatesSchema } from "../../../api/entities";
import {
  addAggTileStatesAtom,
  aggTileStatesAtom,
  aggTileStatesEmitterAtom,
} from "./aggAtoms";
import { ascBucketGranularities, drawEventType, msBucketSizes } from "../const";
import { usPerMs } from "../../../consts";
import { OVERSCAN_BUCKETS } from "./useAggTileStatesQuery";
import { updateAggStatesMesh } from "./aggUtils";
import { getTileSizeNs } from "../useAggQuery";
import type { DataLevel } from "../coverage";
import type { GetDrawTiles } from "../aggDraw";

const hooks = vi.hoisted(() => ({
  rendererRef: { current: undefined as RendererObj | undefined },
  requestRender: () => {},
}));

vi.mock("../../../api/worker/useWsWorker", () => ({ sendMessage: vi.fn() }));
vi.mock("../../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));
vi.mock("../../WebGl/useWebGlRenderer", () => ({
  useWebGlRenderer: () => ({
    containerRef: { current: null },
    rendererRef: hooks.rendererRef,
  }),
}));
vi.mock("../../WebGl/useFrameRender", () => ({
  useFrameRender: () => hooks.requestRender,
}));

const store = getDefaultStore();
const GRANULARITY = "txn";

// draw every bucket from its own granularity
const drawOwnTiles: GetDrawTiles = (granularity, first, last) => [
  { granularity, first, last },
];

// every agg granularity is loaded
const granularityLevels: DataLevel[] = [
  ...[...ascBucketGranularities].reverse().map((granularity) => ({
    id: granularity,
    isAgg: true,
    tileSizeNs: getTileSizeNs(granularity),
    isRangeFetched: () => true,
  })),
  ...tileStatesLevels,
];
const TILE_NS = tileStatesTileNs[GRANULARITY];
const TILE_MS = Number(TILE_NS) / 1e6;

// states of tens of µs, so coarse bins merge them and fine ones keep most
function createTileResponse(seed: number) {
  return createResponse(createRandom(seed), {
    granularity: GRANULARITY,
    startNs: 0n,
    chunkCount: 6,
    chunkNs: 100_000_000,
    stateNs: 30_000,
    idleChance: 0.3,
  }).res;
}

function toData(levels: MergedLevels, referenceSlot: number): TileStatesData {
  return {
    levels,
    referenceSlot,
    txn_slot: [],
    txn_idx: [],
    txn_tile: [],
    txn_start_ms: [],
    txn_end_ms: [],
    txn_error_code: [],
    lthash_slot: [],
    lthash_tile: [],
    lthash_start_ms: [],
    lthash_end_ms: [],
  };
}

function createDataTile(data: TileStatesData): TileStatesDataTile {
  return { startNs: 0n, endNs: TILE_NS - 1n, data, meta: null };
}

function getLevels(rendererObj: RendererObj) {
  const [meshes] = [...rendererObj.dataTileMeshes.values()];
  return meshes.levels;
}

beforeEach(() => {
  store.set(tilesAtom, testTiles);
  store.set(startupTimeAtom, { startupTimeNanos: 0n } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tile states levels", () => {
  it("fits every track's coverage states in a rect's shares", () => {
    for (const statesByGranularity of Object.values(trackStates)) {
      for (const coverageStates of Object.values(statesByGranularity)) {
        expect(coverageStates.length).toBeLessThanOrEqual(MAX_COVERAGE_STATES);
      }
    }
  });

  it("shows the coarsest level whose bin fits the view's px", () => {
    const { levels, referenceSlot } = mergeTileStatesResponse(
      createTileResponse(1),
      testTiles,
    );
    const kept = pruneLevels(levels.execrp);
    expect(kept.length).toBeGreaterThan(1);
    expect(kept.length).toBeLessThan(levels.execrp.length);
    const data = toData({ ...levels, execrp: kept }, referenceSlot);
    vi.spyOn(tileStatesCaches[GRANULARITY], "getTiles").mockReturnValue([
      createDataTile(data),
    ]);

    for (let spanMs = 0.01; spanMs < 4000; spanMs *= 1.37) {
      const rendererObj = createTestRendererObj("execrp", GRANULARITY);
      setVisibleRange(rendererObj, [0, spanMs]);
      syncMeshes(rendererObj);
      const fitting = kept.filter(
        ({ binMs }) => binMs <= rendererObj.msPerPx * MERGE_BIN_PX,
      );
      const expected = fitting.at(-1) ?? kept[0];
      const shown = getLevels(rendererObj).filter(
        ({ mesh }) => mesh.mesh.visible,
      );
      expect(shown).toHaveLength(1);
      expect(shown[0].binMs).toBe(expected.binMs);
      // cached rects show without a copy
      expect(shown[0].mesh.edges).toBe(expected.edges);

      setVisibleRange(rendererObj, [spanMs, spanMs * 1.37]);
      const zoomed = getLevels(rendererObj).filter(
        ({ mesh }) => mesh.mesh.visible,
      );
      const zoomedFitting = kept.filter(
        ({ binMs }) => binMs <= rendererObj.msPerPx * MERGE_BIN_PX,
      );
      expect(zoomed.map(({ binMs }) => binMs)).toEqual(
        spanMs < TILE_MS ? [(zoomedFitting.at(-1) ?? kept[0]).binMs] : [],
      );
    }
  });
});

describe("tile states slots", () => {
  it("draws each state with its slot relative to the highlight's", () => {
    const { res, states } = createResponse(createRandom(4), {
      granularity: GRANULARITY,
      startNs: 0n,
      chunkCount: 3,
      chunkNs: 100_000_000,
      stateNs: 300_000,
      idleChance: 0.3,
    });
    const { levels, referenceSlot } = mergeTileStatesResponse(res, testTiles);
    vi.spyOn(tileStatesCaches[GRANULARITY], "getTiles").mockReturnValue([
      createDataTile(toData(levels, referenceSlot)),
    ]);
    const rendererObj = createTestRendererObj("execrp", GRANULARITY);
    setVisibleRange(rendererObj, [0, 1]);
    syncMeshes(rendererObj);

    const [raw] = getLevels(rendererObj);
    expect(raw.binMs).toBe(0);
    const { highlight } = rendererObj;
    const drawn = Array.from(raw.mesh.slot.subarray(0, raw.mesh.count)).sort();
    const expected = states
      .filter(({ tileIdx }) => testTiles[tileIdx].kind === "execrp")
      .map(({ slot }) =>
        Number.isNaN(slot) ? NO_SLOT : getRelativeSlot(highlight, slot),
      )
      .sort();
    expect(drawn).toEqual(expected);
  });
});

describe("agg tile states", () => {
  it("draws a rect per busy bucket and tile", () => {
    const bucketCount = 1_000;
    const bucketUs = 250_000;
    // one TileState per bucket, busy for a growing share of it
    const tileStates = testTiles.map(({ kind }) =>
      Array.from({ length: 17 }, (_, state) =>
        kind === "execrp" && state === 4
          ? Array.from(
              { length: bucketCount },
              (_, bucket) => ((bucket + 1) / bucketCount) * bucketUs,
            )
          : null,
      ),
    );
    store.set(
      addAggTileStatesAtom,
      aggTileStatesSchema.parse({
        granularity: "250ms",
        reference_ts_ns: "0",
        available_start_ns: null,
        available_end_ns: null,
        tiles: testTiles.map((_, tileIdx) => tileIdx),
        tile_states: tileStates,
      }),
    );
    const rendererObj = createTestRendererObj("execrp", GRANULARITY);
    // 250ms buckets, with overscan past the data on both sides
    const viewMs = 240_000;
    setVisibleRange(rendererObj, [0, viewMs]);
    updateAggStatesMesh(
      rendererObj,
      0n,
      [0, viewMs],
      store.get(aggTileStatesAtom),
      drawOwnTiles,
    );

    const { aggMesh } = rendererObj;
    const rows = 3;
    expect(aggMesh.count).toBe(bucketCount * rows);
    const executeIdx = trackStates.execrp.txn.indexOf(4);
    const stride = aggMesh.barScales.length;
    for (let i = 0; i < aggMesh.count; i++) {
      const bucket = Math.floor(i / rows);
      const startMs = aggMesh.edges[i * 4] + aggMesh.edges[i * 4 + 1];
      expect(startMs + aggMesh.referenceX).toBeCloseTo(bucket * 250, 6);
      expect(aggMesh.bar[i * stride + 1 + executeIdx]).toBe(
        Math.round(((bucket + 1) / bucketCount) * (2 ** 16 - 1)),
      );
    }
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    hooks.rendererRef.current = undefined;
    store.set(isDocumentVisibleAtom, document.visibilityState === "visible");
    store.set(
      smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
      undefined,
    );
  });

  it("rebuilds only when the view leaves the built range or the data changes", () => {
    vi.useFakeTimers();
    const bucketMs = msBucketSizes["250ms"];
    const rows = testTiles.filter(({ kind }) => kind === "execrp").length;
    const viewBuckets = 960;
    const panBuckets = OVERSCAN_BUCKETS / 2;
    const [firstState, secondState] = trackStates.execrp.txn;
    // execrp tiles busy in two states, or only the first from bucket
    // soloFromBucket on
    const setAggData = (soloFromBucket: number) =>
      store.set(
        addAggTileStatesAtom,
        aggTileStatesSchema.parse({
          granularity: "250ms",
          reference_ts_ns: "0",
          available_start_ns: null,
          available_end_ns: null,
          tiles: testTiles.map((_, tileIdx) => tileIdx),
          tile_states: testTiles.map(({ kind }) =>
            Array.from({ length: 17 }, (_, state) =>
              kind === "execrp" &&
              (state === firstState || state === secondState)
                ? Array.from({ length: viewBuckets * 2 }, (_, bucket) =>
                    state === secondState && bucket >= soloFromBucket
                      ? 0
                      : (bucketMs * usPerMs) / 4,
                  )
                : null,
            ),
          ),
        }),
      );
    // single-state buckets only past the view, but within the pan
    setAggData(viewBuckets + panBuckets / 2);
    store.set(isDocumentVisibleAtom, true);
    store.set(
      smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
      10_000_000_000_000n,
    );
    store.set(visibleRangeAtom, [0, viewBuckets * bucketMs]);
    const rendererObj = createTestRendererObj("execrp", GRANULARITY);
    hooks.rendererRef.current = rendererObj;
    renderHook(() =>
      useTileStatesRenderer({
        config: rendererObj.config,
        remount: () => {},
        query: () => {},
        granularityLevels,
      }),
    );

    const firstBuild = rendererObj.aggMeshBuild;
    const firstEndIdx = viewBuckets - 1 + OVERSCAN_BUCKETS;
    expect(firstBuild).toMatchObject({
      startIdx: -OVERSCAN_BUCKETS,
      endIdx: firstEndIdx,
    });
    expect(rendererObj.aggMesh.count).toBe((firstEndIdx + 1) * rows);
    expect(rendererObj.aggMaxStateShare).toBe(0.5);

    store.set(visibleRangeAtom, [
      panBuckets * bucketMs,
      (panBuckets + viewBuckets) * bucketMs,
    ]);
    expect(rendererObj.aggMeshBuild).toBe(firstBuild);
    expect(rendererObj.aggMaxStateShare).toBe(1);
    store.get(aggTileStatesEmitterAtom).emit(drawEventType);
    vi.advanceTimersByTime(100);
    expect(rendererObj.aggMeshBuild).toBe(firstBuild);

    // two states everywhere
    setAggData(viewBuckets * 2);
    vi.advanceTimersByTime(100);
    const secondBuild = rendererObj.aggMeshBuild;
    const secondEndIdx = panBuckets + viewBuckets - 1 + OVERSCAN_BUCKETS;
    expect(secondBuild).not.toBe(firstBuild);
    expect(secondBuild).toMatchObject({
      startIdx: panBuckets - OVERSCAN_BUCKETS,
      endIdx: secondEndIdx,
    });
    expect(rendererObj.aggMesh.count).toBe((secondEndIdx + 1) * rows);
    expect(rendererObj.aggMaxStateShare).toBe(0.5);
  });
});
