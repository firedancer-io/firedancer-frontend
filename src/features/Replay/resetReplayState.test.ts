import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  atom,
  getDefaultStore,
  type Atom,
  type PrimitiveAtom,
  type WritableAtom,
} from "jotai";
import type {
  AggCpu,
  AggGranularity,
  AggRevenue,
  AggShreds,
  AggSlots,
  AggTileStates,
  AggVotes,
  TimelineShreds,
  TimelineSlots,
} from "../../api/types";
import { smoothedNowNsAtom } from "../../nowAtoms";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import {
  hoveredAggCpuAtom,
  hoveredAggRevenueAtom,
  hoveredAggShredsAtom,
  hoveredExecrpTxnAtom,
  hoveredMsAtom,
  hoveredRevenueTxnAtom,
  hoveredShredAtom,
  isLiveAtom,
  openOrUpdateOverlapAtom,
  pauseAtom,
  pinnedTooltipAtom,
  reserveNextQueryIdAtom,
  selectSlotAtMsAtom,
  selectedSlotAtom,
  setHoverInfoAtom,
} from "./atoms";
import { addAggSlotsAtom, aggSlotsAtom } from "./HeaderTrack/aggAtoms";
import {
  addTimelineSlotsAtom,
  timelineSlotsAtom,
} from "./HeaderTrack/nonAggAtoms";
import {
  addAggShredsAtom,
  aggShredsAtom,
  timelineFecShredsAtoms,
  timelineShredsAtoms,
} from "./ShredsTrack/atoms";
import { addAggRevenueAtom, aggRevenueAtom } from "./RevenueTrack/atoms";
import { txnMetaCache } from "./RevenueTrack/txnMeta/txnMetaCache";
import { addAggCpuAtom, aggCpuAtom } from "./CpuTrack/atoms";
import { addAggTileStatesAtom, aggTileStatesAtom } from "./tileStates/aggAtoms";
import { tileStatesCaches } from "./tileStates/tileStatesCache";
import { addAggVotesAtom, aggVotesAtom } from "./VotesTrack/aggAtoms";
import { votesCaches } from "./VotesTrack/votesCache";
import { eventsByTypeFamily, timelineEventTypes } from "./Events/atoms";
import { createParallelCache } from "./parallelQueriesCache";
import { setStartupTimeAtom } from "./resetReplayState";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const store = getDefaultStore();
const msNs = 1_000_000n;
const STARTUP_NS = 1_000n * msNs;
const granularity = "1s" as AggGranularity;
// header tiles are 10s, so the first second after startup is tile 0
const HEADER_TILE_IDX = 0;
// both slots span relative ms [100, 900]
const OVERLAP_MS = 500;
const clientPos = { x: 0, y: 0 };

// the path the ws handler takes for startup_time_nanos
function setStartupTime(startupTimeNanos: bigint) {
  store.set(setStartupTimeAtom, startupTimeNanos);
}

const hoveredAtoms: WritableAtom<unknown, [undefined], void>[] = [
  hoveredShredAtom,
  hoveredExecrpTxnAtom,
  hoveredAggShredsAtom,
  hoveredAggRevenueAtom,
  hoveredAggCpuAtom,
  hoveredRevenueTxnAtom,
];

const aggAtoms: Atom<{ size: number }>[] = [
  aggSlotsAtom,
  aggShredsAtom,
  aggRevenueAtom,
  aggCpuAtom,
  aggTileStatesAtom,
  aggVotesAtom,
];

const tileCaches = [
  ...Object.values(tileStatesCaches),
  ...Object.values(votesCaches),
  txnMetaCache,
];

/** count each tile cache's reset notices */
function watchTileCacheResets() {
  const resets = new Map<object, number>();
  for (const cache of tileCaches) {
    resets.set(cache, 0);
    cache.subscribe((delta) => {
      if (delta.kind === "reset")
        resets.set(cache, (resets.get(cache) ?? 0) + 1);
    });
  }
  return () => [...resets.values()];
}

/** a parallel cache over 1s tiles, recording the tiles it requests */
function createTestParallelCache() {
  const requestedTiles: bigint[] = [];
  const queryIds: number[] = [];
  const cache = createParallelCache<"1s">({
    chartId: "reset-test",
    getTileSizeNs: () => 1_000n * msNs,
    overscanTilesCount: 0,
    queryKey: "query_agg_slots",
    sendQuery: (queryId, startNs) => {
      queryIds.push(queryId);
      requestedTiles.push(startNs);
    },
    getTileEvictionHighWatermark: () => 100,
    getTileEvictionLowWatermark: () => 100,
    onEvictTiles: () => {},
  });
  const queryFirstTile = () =>
    cache.queryRange(
      [STARTUP_NS, STARTUP_NS + 500n * msNs],
      [STARTUP_NS, STARTUP_NS + 60_000n * msNs],
      "1s",
      undefined,
    );
  return { cache, requestedTiles, queryIds, queryFirstTile };
}

function seedAggData() {
  const bucket = { granularity, reference_ts_ns: STARTUP_NS };
  store.set(addAggSlotsAtom, {
    ...bucket,
    start_slot: [1],
    end_slot: [2],
    skipped: [0],
    mine: [0],
    mine_skipped: [0],
  } as unknown as AggSlots);
  store.set(addAggShredsAtom, {
    ...bucket,
    turbine: [1],
    repair: [1],
    reconstructed: [1],
    published: [1],
  } as unknown as AggShreds);
  store.set(addAggRevenueAtom, {
    ...bucket,
    txn_fees: [1n],
    prio_fees: [1n],
    tips: [1n],
  } as unknown as AggRevenue);
  store.set(addAggCpuAtom, {
    ...bucket,
    utilization: [[100]],
  } as unknown as AggCpu);
  store.set(addAggTileStatesAtom, {
    ...bucket,
    tiles: [0],
    tile_states: [[[1]]],
  } as unknown as AggTileStates);
  store.set(addAggVotesAtom, {
    ...bucket,
    notarized_latency_ns: [1],
    finalized_fast_latency_ns: [1],
    finalized_slow_latency_ns: [1],
  } as AggVotes);
}

function seedTimelineData() {
  // two overlapping slots, so the overlap tooltip can open
  store.set(addTimelineSlotsAtom, HEADER_TILE_IDX, {
    reference_slot: 100,
    reference_ts: STARTUP_NS,
    slot_delta: [0, 1],
    start_ts_delta: [100n * msNs, 100n * msNs],
    end_ts_delta: [900n * msNs, 900n * msNs],
    skipped: [0, 0],
    mine: [0, 0],
    shred_cnt: [null, null],
    txn_fees: [null, null],
    prio_fees: [null, null],
    tips: [null, null],
  } as unknown as TimelineSlots);
  for (const shredAtoms of [timelineShredsAtoms, timelineFecShredsAtoms]) {
    store.set(shredAtoms.addShredEvents, HEADER_TILE_IDX, {
      granularity: "shred",
      chunks: [],
    } as unknown as TimelineShreds);
  }
  for (const type of timelineEventTypes) {
    store.set(eventsByTypeFamily(type), [{ slot: 100, ts: OVERLAP_MS }]);
  }
}

function seedViewState() {
  store.set(pauseAtom, [0, 1_000]);
  store.set(selectSlotAtMsAtom, OVERLAP_MS, 100);
  store.set(setHoverInfoAtom, {
    owner: "test",
    cursorMs: OVERLAP_MS,
    clientPos,
  });
  store.set(openOrUpdateOverlapAtom, { ts: OVERLAP_MS, clientPos });

  // a stand-in value; cleared first so the atoms' same-value checks never
  // compare two stand-ins
  const hovered = { slot: 100 } as never;
  for (const hoveredAtom of hoveredAtoms) {
    store.set(hoveredAtom, undefined);
    store.set(hoveredAtom, hovered);
  }
}

beforeEach(() => {
  setStartupTime(STARTUP_NS);
  // world range spans 1 min from the startup time
  store.set(
    smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
    61_000n * msNs,
  );
  seedAggData();
  seedTimelineData();
  seedViewState();
});

describe("setStartupTimeAtom", () => {
  it("starts with every piece of state seeded", () => {
    for (const aggAtom of aggAtoms) {
      expect(store.get(aggAtom).size).toBeGreaterThan(0);
    }
    expect(store.get(timelineSlotsAtom).slotGroups.size).toBeGreaterThan(0);
    expect(store.get(timelineShredsAtoms.slotsShreds)).toBeDefined();
    expect(store.get(timelineFecShredsAtoms.slotsShreds)).toBeDefined();
    expect(store.get(selectedSlotAtom)).toBe(100);
    expect(store.get(pinnedTooltipAtom)).toBeDefined();
    expect(store.get(hoveredMsAtom)).toBe(OVERLAP_MS);
    expect(store.get(isLiveAtom)).toBe(false);
  });

  it("clears all stored Replay state when the startup time changes", () => {
    const getTileCacheResets = watchTileCacheResets();
    // the parallel cache only queries while connected
    store.set(socketStateAtom, SocketState.Connected);
    const parallel = createTestParallelCache();
    parallel.queryFirstTile();
    parallel.cache.markQueryComplete(parallel.queryIds[0]);
    parallel.queryFirstTile();
    // the fetched tile isn't requested again
    expect(parallel.requestedTiles).toHaveLength(1);
    const nextQueryId = store.set(reserveNextQueryIdAtom, "query_agg_cpu") + 1;

    setStartupTime(2_000n * msNs);

    // tile caches and parallel query state
    expect(getTileCacheResets()).toEqual(tileCaches.map(() => 1));
    parallel.queryFirstTile();
    expect(parallel.requestedTiles).toHaveLength(2);

    // agg data
    for (const aggAtom of aggAtoms) {
      expect(store.get(aggAtom).size).toBe(0);
    }

    // timeline data
    const { slotGroups, tileSlotGroups } = store.get(timelineSlotsAtom);
    expect(slotGroups.size).toBe(0);
    expect(tileSlotGroups.size).toBe(0);
    expect(store.get(timelineShredsAtoms.slotsShreds)).toBeUndefined();
    expect(store.get(timelineShredsAtoms.tileToSlots).size).toBe(0);
    expect(store.get(timelineFecShredsAtoms.slotsShreds)).toBeUndefined();
    for (const type of timelineEventTypes) {
      expect(store.get(eventsByTypeFamily(type))).toEqual([]);
    }

    // selection, hover, tooltips
    expect(store.get(selectedSlotAtom)).toBeUndefined();
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(store.get(hoveredMsAtom)).toBeUndefined();
    for (const hoveredAtom of hoveredAtoms) {
      expect(store.get(hoveredAtom)).toBeUndefined();
    }

    // playback goes back to live
    expect(store.get(isLiveAtom)).toBe(true);

    // query ids keep counting so late responses can't match new queries
    expect(store.set(reserveNextQueryIdAtom, "query_agg_cpu")).toBe(
      nextQueryId,
    );
  });

  it("rebases new shreds on the new startup time", () => {
    setStartupTime(2_000n * msNs);
    store.set(timelineShredsAtoms.addShredEvents, 0, {
      granularity: "shred",
      chunks: [],
    } as unknown as TimelineShreds);

    expect(store.get(timelineShredsAtoms.slotsShreds)?.referenceTs).toBe(
      2_000n * msNs,
    );
  });

  it("keeps state when the startup time is set to the same value", () => {
    const getTileCacheResets = watchTileCacheResets();

    setStartupTime(STARTUP_NS);

    expect(getTileCacheResets()).toEqual(tileCaches.map(() => 0));
    expect(store.get(aggCpuAtom).size).toBeGreaterThan(0);
    expect(store.get(timelineSlotsAtom).slotGroups.size).toBeGreaterThan(0);
    expect(store.get(selectedSlotAtom)).toBe(100);
    expect(store.get(pinnedTooltipAtom)).toBeDefined();
  });
});
