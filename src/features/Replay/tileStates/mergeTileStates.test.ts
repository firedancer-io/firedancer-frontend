import { describe, expect, it } from "vitest";
import type {
  TileStatesGranularity,
  TimelineTileStates,
} from "../../../api/types";
import {
  getTileRows,
  tileKinds,
  tileStatesTileNs,
  trackStates,
  type TileKind,
} from "./consts";
import {
  concatLevels,
  mergeTileStatesResponse,
  pruneLevels,
  type MergedLevel,
} from "./mergeTileStates";
import { MAX_COVERAGE_STATES } from "./tileStatesRects";
import {
  createRandom,
  createResponse,
  testTiles,
  type TestState,
} from "./tileStatesTestData";

interface Rect {
  row: number;
  startMs: number;
  endMs: number;
  shares: number[];
  // NaN without a slot
  slot: number;
}

function getRowOfTile(kind: TileKind) {
  return new Map(
    getTileRows(testTiles, kind).map(({ tileIdx }, row) => [tileIdx, row]),
  );
}

const SHARE_MAX = 2 ** 16 - 1;
// shares round to SHARE_MAX steps
const SHARE_TOLERANCE = 1 / SHARE_MAX;
const TIME_TOLERANCE = 1e-6;

function readRects(
  { edges, bar, slot, count }: MergedLevel,
  referenceSlot: number,
): Rect[] {
  const stride = MAX_COVERAGE_STATES + 1;
  return Array.from({ length: count }, (_, i) => ({
    slot: referenceSlot + slot[i],
    row: bar[i * stride],
    startMs: edges[i * 4] + edges[i * 4 + 1],
    endMs: edges[i * 4 + 2] + edges[i * 4 + 3],
    shares: Array.from(
      bar.subarray(i * stride + 1, (i + 1) * stride),
      (share) => share / SHARE_MAX,
    ),
  }));
}

/** A track's states as rects, in ms from the data tile's start */
function toRawRects(
  states: TestState[],
  kind: TileKind,
  granularity: TileStatesGranularity,
  offsetMs: number,
): Rect[] {
  const rowOfTile = getRowOfTile(kind);
  const coverage = trackStates[kind][granularity];
  const rects: Rect[] = [];
  for (const { tileIdx, state, startNs, endNs, slot } of states) {
    const row = rowOfTile.get(tileIdx);
    if (row === undefined) continue;
    const shares = new Array<number>(MAX_COVERAGE_STATES).fill(0);
    shares[coverage.indexOf(state)] = 1;
    rects.push({
      row,
      startMs: offsetMs + startNs / 1e6,
      endMs: offsetMs + endNs / 1e6,
      shares,
      slot,
    });
  }
  return rects;
}

/** What the coverage target accumulates: each px's covered fraction per row and state */
function coverage(
  rects: Rect[],
  rowCount: number,
  pxMs: number,
  pxCount: number,
) {
  const texels = new Float64Array(rowCount * MAX_COVERAGE_STATES * pxCount);
  for (const { row, startMs, endMs, shares } of rects) {
    const firstPx = Math.max(Math.floor(startMs / pxMs), 0);
    const lastPx = Math.min(Math.floor(endMs / pxMs), pxCount - 1);
    for (let px = firstPx; px <= lastPx; px++) {
      const overlap =
        Math.min(endMs, (px + 1) * pxMs) - Math.max(startMs, px * pxMs);
      if (overlap <= 0) continue;
      shares.forEach((share, stateIdx) => {
        texels[(row * MAX_COVERAGE_STATES + stateIdx) * pxCount + px] +=
          (overlap / pxMs) * share;
      });
    }
  }
  return texels;
}

const granularities: TileStatesGranularity[] = ["txn", "txn_batch"];

function randomResponse(
  seed: number,
  granularity: TileStatesGranularity,
  offsetChunks?: number,
) {
  const random = createRandom(seed);
  const tileNs = tileStatesTileNs[granularity];
  // starts somewhere in a data tile, at a chunk boundary
  const offsetNs =
    BigInt(offsetChunks ?? Math.floor(random() * 5)) * 100_000_000n;
  const { res, states } = createResponse(random, {
    granularity,
    startNs: 7n * tileNs + offsetNs,
    chunkCount: 1 + Math.floor(random() * 3),
    chunkNs: 100_000_000,
    stateNs: 10 ** (4.5 + random() * 2.5),
    idleChance: random(),
  });
  return { random, res, states, offsetMs: Number(offsetNs) / 1e6 };
}

function expectMatchesStates(
  rects: Rect[],
  raw: Rect[],
  binMs: number,
  rowCount: number,
  random: () => number,
) {
  // per row and state time is conserved
  const rawTime = new Float64Array(rowCount * MAX_COVERAGE_STATES);
  const mergedTime = new Float64Array(rowCount * MAX_COVERAGE_STATES);
  const rowTime = new Float64Array(rowCount);
  for (const { row, startMs, endMs, shares } of raw) {
    shares.forEach((share, stateIdx) => {
      rawTime[row * MAX_COVERAGE_STATES + stateIdx] +=
        (endMs - startMs) * share;
    });
  }
  for (const { row, startMs, endMs, shares } of rects) {
    rowTime[row] += endMs - startMs;
    shares.forEach((share, stateIdx) => {
      mergedTime[row * MAX_COVERAGE_STATES + stateIdx] +=
        (endMs - startMs) * share;
    });
  }
  rawTime.forEach((timeMs, i) => {
    const row = Math.floor(i / MAX_COVERAGE_STATES);
    expect(Math.abs(mergedTime[i] - timeMs)).toBeLessThanOrEqual(
      SHARE_TOLERANCE * rowTime[row] + TIME_TOLERANCE,
    );
  });

  // each slot keeps its busy time, and no run spans two slots
  const slotTime = new Map<string, number>();
  const addSlotTime = (
    { row, slot, startMs, endMs, shares }: Rect,
    sign: number,
  ) => {
    const key = `${row}:${slot}`;
    const busy = shares.reduce((sum, share) => sum + share, 0);
    slotTime.set(
      key,
      (slotTime.get(key) ?? 0) + sign * (endMs - startMs) * busy,
    );
  };
  for (const rect of raw) addSlotTime(rect, 1);
  for (const rect of rects) addSlotTime(rect, -1);
  const totalTime = rowTime.reduce((sum, time) => sum + time, 0);
  for (const time of slotTime.values()) {
    expect(Math.abs(time)).toBeLessThanOrEqual(
      SHARE_TOLERANCE * totalTime + TIME_TOLERANCE,
    );
  }
  const isSameSlot = (a: number, b: number) =>
    a === b || (Number.isNaN(a) && Number.isNaN(b));
  const rawByRow = Array.from({ length: rowCount }, (_, row) =>
    raw
      .filter((rect) => rect.row === row)
      .sort((a, b) => a.startMs - b.startMs),
  );
  const spansSlots = (rect: Rect) => {
    const rowStates = rawByRow[rect.row];
    let lo = 0;
    let hi = rowStates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rowStates[mid].endMs <= rect.startMs + TIME_TOLERANCE) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < rowStates.length; i++) {
      if (rowStates[i].startMs >= rect.endMs - TIME_TOLERANCE) break;
      if (!isSameSlot(rowStates[i].slot, rect.slot)) return true;
    }
    return false;
  };
  expect(rects.filter(spansSlots)).toEqual([]);

  // wide states stay exact, and runs are at most a bin
  const isOneHot = (rect: Rect) =>
    rect.shares.filter((share) => share !== 0).length === 1 &&
    rect.shares.includes(1);
  const near = (a: number, b: number) =>
    Math.abs(a - b) <= TIME_TOLERANCE * Math.max(1, Math.abs(b));
  const wide = raw.filter(({ startMs, endMs }) => endMs - startMs >= binMs);
  const wideStarts = [...wide].sort((a, b) => a.startMs - b.startMs);
  const findWide = (rect: Rect) => {
    let lo = 0;
    let hi = wideStarts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (wideStarts[mid].startMs < rect.startMs - TIME_TOLERANCE) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < wideStarts.length; i++) {
      const state = wideStarts[i];
      if (!near(rect.startMs, state.startMs)) return false;
      if (
        state.row === rect.row &&
        near(rect.endMs, state.endMs) &&
        isSameSlot(state.slot, rect.slot)
      ) {
        return true;
      }
    }
    return false;
  };
  const longRects = rects.filter(
    ({ startMs, endMs }) => endMs - startMs > binMs * (1 + TIME_TOLERANCE),
  );
  expect(
    longRects.filter((rect) => !isOneHot(rect) || !findWide(rect)),
  ).toEqual([]);
  expect(rects.filter(isOneHot).length).toBeGreaterThanOrEqual(wide.length);

  // only the 2 runs crossing a px edge can misplace time, each by up to
  // 2 bins over both its states
  const endMs = Math.max(0, ...raw.map((rect) => rect.endMs));
  const pxMs = Math.max(binMs * (1 + random() * 8), endMs / 5_000, 1e-3);
  const pxCount = Math.ceil(endMs / pxMs) + 1;
  const rawCoverage = coverage(raw, rowCount, pxMs, pxCount);
  const mergedCoverage = coverage(rects, rowCount, pxMs, pxCount);
  const maxErrorPerPx =
    (4 * binMs) / pxMs + MAX_COVERAGE_STATES * SHARE_TOLERANCE;
  let maxError = 0;
  for (let row = 0; row < rowCount; row++) {
    for (let px = 0; px < pxCount; px++) {
      let error = 0;
      for (let stateIdx = 0; stateIdx < MAX_COVERAGE_STATES; stateIdx++) {
        const i = (row * MAX_COVERAGE_STATES + stateIdx) * pxCount + px;
        error += Math.abs(mergedCoverage[i] - rawCoverage[i]);
      }
      maxError = Math.max(maxError, error);
    }
  }
  expect(maxError).toBeLessThanOrEqual(maxErrorPerPx);
}

function splitResponse(
  res: TimelineTileStates,
  chunkIdx: number,
): [TimelineTileStates, TimelineTileStates] {
  return [
    { ...res, chunks: res.chunks.slice(0, chunkIdx) },
    { ...res, chunks: res.chunks.slice(chunkIdx) },
  ];
}

describe.each(granularities)("mergeTileStatesResponse (%s)", (granularity) => {
  it("matches each track's states within every level's bin", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { random, res, states, offsetMs } = randomResponse(
        seed,
        granularity,
      );
      const { levels, referenceSlot } = mergeTileStatesResponse(res, testTiles);
      for (const kind of tileKinds) {
        const rowCount = getRowOfTile(kind).size;
        const raw = toRawRects(states, kind, granularity, offsetMs);
        for (const level of levels[kind]) {
          expectMatchesStates(
            readRects(level, referenceSlot),
            raw,
            level.binMs,
            rowCount,
            random,
          );
        }
      }
    }
  });

  it("keeps every state in the 0 bin level", () => {
    const { res, states, offsetMs } = randomResponse(3, granularity);
    const { levels, referenceSlot } = mergeTileStatesResponse(res, testTiles);
    for (const kind of tileKinds) {
      const raw = toRawRects(states, kind, granularity, offsetMs);
      expect(levels[kind][0].binMs).toBe(0);
      const byStart = (a: Rect, b: Rect) =>
        a.row - b.row || a.startMs - b.startMs;
      expect(readRects(levels[kind][0], referenceSlot).sort(byStart)).toEqual(
        raw.sort(byStart).map((rect) => ({
          ...rect,
          startMs: expect.closeTo(rect.startMs, 6) as number,
          endMs: expect.closeTo(rect.endMs, 6) as number,
        })),
      );
    }
  });

  it("places states from the tile owning the chunk, even if they start before it", () => {
    const { res } = randomResponse(1, granularity, 0);
    // the first chunk's states start 1ms before its tile, at the same times
    const shiftNs = 1_000_000;
    const [first, ...rest] = res.chunks;
    const shifted: TimelineTileStates = {
      ...res,
      chunks: [
        {
          ...first,
          start_ts: first.chunk_ts - BigInt(shiftNs),
          tile_start_ts_delta: first.tile_start_ts_delta.map(
            (delta) => delta + shiftNs,
          ),
        },
        ...rest,
      ],
    };
    expect(first.start_ts).toBe(first.chunk_ts);
    expect(mergeTileStatesResponse(shifted, testTiles)).toEqual(
      mergeTileStatesResponse(res, testTiles),
    );
  });

  it("merges split responses into levels that stay within each response", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { random, res, states, offsetMs } = randomResponse(
        seed,
        granularity,
      );
      if (res.chunks.length < 2) continue;
      const splitIdx = 1 + Math.floor(random() * (res.chunks.length - 1));
      const [first, second] = splitResponse(res, splitIdx);
      const splitMs = offsetMs + (splitIdx * 100_000_000) / 1e6;
      const firstMerged = mergeTileStatesResponse(first, testTiles);
      const secondMerged = mergeTileStatesResponse(second, testTiles);
      for (const kind of tileKinds) {
        const rowCount = getRowOfTile(kind).size;
        const raw = toRawRects(states, kind, granularity, offsetMs);
        const levels = concatLevels(
          firstMerged.levels[kind],
          secondMerged.levels[kind],
          secondMerged.referenceSlot - firstMerged.referenceSlot,
        );
        for (const level of levels) {
          const rects = readRects(level, firstMerged.referenceSlot);
          expectMatchesStates(rects, raw, level.binMs, rowCount, random);
          // only the second response's first state per row can start before it
          const crossing = rects.filter(
            ({ row, startMs, endMs }) =>
              endMs > splitMs + TIME_TOLERANCE &&
              startMs < splitMs - TIME_TOLERANCE &&
              !raw.some(
                (state) =>
                  state.row === row &&
                  state.endMs > splitMs &&
                  Math.abs(state.startMs - startMs) <= TIME_TOLERANCE,
              ),
          );
          expect(crossing).toEqual([]);
        }
      }
    }
  });

  it("has no slots without a reference slot", () => {
    const { res } = randomResponse(5, granularity);
    const noReference = {
      ...res,
      chunks: res.chunks.map((chunk) => ({ ...chunk, reference_slot: null })),
    };
    const { levels, referenceSlot } = mergeTileStatesResponse(
      noReference,
      testTiles,
    );
    expect(referenceSlot).toBeNaN();
    for (const kind of tileKinds) {
      for (const { slot } of levels[kind]) {
        expect(slot.every((value) => Number.isNaN(value))).toBe(true);
      }
    }
  });

  it("merges an empty response into no levels, which concat skips", () => {
    const { res } = randomResponse(6, granularity);
    const merged = mergeTileStatesResponse(res, testTiles);
    const empty = mergeTileStatesResponse({ ...res, chunks: [] }, testTiles);
    expect(empty.levels).toEqual({ execrp: [], replay: [] });
    for (const kind of tileKinds) {
      expect(concatLevels(merged.levels[kind], empty.levels[kind], NaN)).toBe(
        merged.levels[kind],
      );
      expect(concatLevels(empty.levels[kind], merged.levels[kind], 0)).toBe(
        merged.levels[kind],
      );
    }
  });
});

describe.each(granularities)("pruneLevels (%s)", (granularity) => {
  it("keeps the finest level and levels with at most 3/4 of the last kept one's rects", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { res } = randomResponse(seed, granularity);
      const { levels } = mergeTileStatesResponse(res, testTiles);
      for (const kind of tileKinds) {
        const kept = pruneLevels(levels[kind]);
        expect(kept[0]).toBe(levels[kind][0]);
        for (let i = 1; i < kept.length; i++) {
          expect(kept[i].count).toBeLessThanOrEqual(kept[i - 1].count * 0.75);
        }
        for (const level of levels[kind]) {
          if (kept.includes(level)) continue;
          const finer = kept.filter(({ binMs }) => binMs < level.binMs).at(-1);
          expect(level.count).toBeGreaterThan((finer?.count ?? 0) * 0.75);
        }
      }
    }
  });
});
