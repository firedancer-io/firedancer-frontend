import { TileState } from "../../../api/entities.ts";
import type {
  Tile,
  TimelineTileStates,
  TimelineTileStatesChunk,
} from "../../../api/types.ts";
import {
  getTileRows,
  mergeBinsMs,
  tileKinds,
  tileStatesTileNs,
  trackStates,
  type TileKind,
} from "./consts.ts";
import {
  addOneHotRect,
  addRect,
  getBarScales,
  MAX_COVERAGE_STATES,
  tileStatesBarLayout,
  type Rects,
} from "./tileStatesRects.ts";

// states shorter than binMs merge into runs up to binMs long, per slot
export interface MergedLevel {
  binMs: number;
  edges: Float32Array;
  bar: Uint16Array;
  // from referenceSlot, NaN without a slot
  slot: Float32Array;
  count: number;
}

export type MergedLevels = Record<TileKind, MergedLevel[]>;

export interface MergedTileStates {
  levels: MergedLevels;
  // NaN without slots
  referenceSlot: number;
}

export type MergedTileStatesResponse = TimelineTileStates & {
  merged?: MergedTileStates;
};

const tileStatesSet = new Set<number>(
  Object.values(TileState).filter(
    (value): value is number => typeof value === "number",
  ),
);

// only log unknown states once each
const loggedUnknownTileStates = new Set<number>();

function isKnownTileState(state: number) {
  const isKnown = tileStatesSet.has(state);
  if (!isKnown && !loggedUnknownTileStates.has(state)) {
    loggedUnknownTileStates.add(state);
    console.error(`Received unrecognized tile state: ${state}`);
  }
  return isKnown;
}

interface RowStates {
  count: number;
  rows: Int32Array;
  stateIdxs: Int32Array;
  startsMs: Float64Array;
  endsMs: Float64Array;
  slots: Float64Array;
}

// each state's slot, from the replay tile's slot segments and the txn segments
function getStateSlots(chunk: TimelineTileStatesChunk, refSlot: number) {
  const stateSlot = new Float64Array(chunk.state.length).fill(NaN);
  const segments = [
    [chunk.slot_state_lo, chunk.slot_state_cnt, chunk.slot_delta],
    [chunk.txn_state_lo, chunk.txn_state_cnt, chunk.txn_slot_delta],
  ];
  for (const [stateLo, stateCnt, slotDelta] of segments) {
    for (let segmentIdx = 0; segmentIdx < stateLo.length; segmentIdx++) {
      const firstStateIdx = stateLo[segmentIdx];
      stateSlot.fill(
        refSlot + slotDelta[segmentIdx],
        firstStateIdx,
        firstStateIdx + stateCnt[segmentIdx],
      );
    }
  }
  // each LtHash task is one state
  for (let taskIdx = 0; taskIdx < chunk.lthash_state_lo.length; taskIdx++) {
    stateSlot[chunk.lthash_state_lo[taskIdx]] =
      refSlot + chunk.lthash_slot_delta[taskIdx];
  }
  return stateSlot;
}

function createRowStates(length: number): RowStates {
  return {
    count: 0,
    rows: new Int32Array(length),
    stateIdxs: new Int32Array(length),
    startsMs: new Float64Array(length),
    endsMs: new Float64Array(length),
    slots: new Float64Array(length),
  };
}

/** Each track's drawn states, as rows and coverage state indexes */
function getRowStates(
  res: TimelineTileStates,
  tiles: Tile[] | undefined,
  tileStartNs: bigint,
  referenceSlot: number,
): Record<TileKind, RowStates> {
  const kindOfTile: (TileKind | undefined)[] = [];
  const rowOfTile: number[] = [];
  const stateIdxs = {} as Record<TileKind, number[]>;
  for (const kind of tileKinds) {
    getTileRows(tiles, kind).forEach(({ tileIdx }, row) => {
      kindOfTile[tileIdx] = kind;
      rowOfTile[tileIdx] = row;
    });
    stateIdxs[kind] = getStateIdxs(trackStates[kind][res.granularity]);
  }

  const lengths = { execrp: 0, replay: 0 };
  for (const chunk of res.chunks) {
    chunk.tile.forEach((tile, tileIdx) => {
      const kind = tile == null ? undefined : kindOfTile[tile];
      if (kind) lengths[kind] += chunk.state_cnt[tileIdx];
    });
  }
  const states = {
    execrp: createRowStates(lengths.execrp),
    replay: createRowStates(lengths.replay),
  };

  for (const chunk of res.chunks) {
    const chunkStartNs = Number(chunk.start_ts - tileStartNs);
    const stateSlot = getStateSlots(chunk, chunk.reference_slot ?? 0);
    // laid out as in parseTxns
    let stateIdx = 0;
    for (let tileIdx = 0; tileIdx < chunk.tile.length; tileIdx++) {
      const tile = chunk.tile[tileIdx];
      const kind = tile == null ? undefined : kindOfTile[tile];
      const endStateIdxForTile = stateIdx + chunk.state_cnt[tileIdx];
      if (!kind || tile == null) {
        stateIdx = endStateIdxForTile;
        continue;
      }
      const kindStates = states[kind];
      const kindStateIdxs = stateIdxs[kind];
      const row = rowOfTile[tile];
      let nextStartNs =
        chunkStartNs + (chunk.tile_start_ts_delta[tileIdx] || 0);
      for (; stateIdx < endStateIdxForTile; stateIdx++) {
        const startNs = nextStartNs;
        const endNs = startNs + chunk.dur[stateIdx];
        nextStartNs = endNs;
        const state = chunk.state[stateIdx];
        if (endNs === startNs || !isKnownTileState(state)) continue;
        if (kindStateIdxs[state] < 0) continue;
        const i = kindStates.count++;
        kindStates.rows[i] = row;
        kindStates.stateIdxs[i] = kindStateIdxs[state];
        kindStates.startsMs[i] = startNs / 1e6;
        kindStates.endsMs[i] = endNs / 1e6;
        kindStates.slots[i] = stateSlot[stateIdx] - referenceSlot;
      }
    }
  }
  return states;
}

function isSameSlot(slot: number, other: number) {
  return slot === other || (Number.isNaN(slot) && Number.isNaN(other));
}

function endsRun(
  runStartMs: number,
  runSlot: number,
  startMs: number,
  endMs: number,
  slot: number,
  binMs: number,
) {
  return (
    !Number.isNaN(runStartMs) &&
    (endMs - startMs >= binMs ||
      endMs - runStartMs > binMs ||
      !isSameSlot(slot, runSlot))
  );
}

/** How many rects merging the states makes */
function countRects(states: RowStates, binMs: number, rowCount: number) {
  const runStartMs = new Float64Array(rowCount).fill(NaN);
  const runSlot = new Float64Array(rowCount);
  let count = 0;
  for (let i = 0; i < states.count; i++) {
    const row = states.rows[i];
    const startMs = states.startsMs[i];
    const endMs = states.endsMs[i];
    const slot = states.slots[i];
    if (endsRun(runStartMs[row], runSlot[row], startMs, endMs, slot, binMs)) {
      count++;
      runStartMs[row] = NaN;
    }
    if (endMs - startMs >= binMs) {
      count++;
    } else if (Number.isNaN(runStartMs[row])) {
      runStartMs[row] = startMs;
      runSlot[row] = slot;
    }
  }
  for (const runStart of runStartMs) {
    if (!Number.isNaN(runStart)) count++;
  }
  return count;
}

function mergeLevel(
  states: RowStates,
  binMs: number,
  rowCount: number,
): MergedLevel {
  const count = countRects(states, binMs, rowCount);
  const rects: Rects = {
    edges: new Float32Array(count * 4),
    bar: new Uint16Array(count * (MAX_COVERAGE_STATES + 1)),
    barScales: getBarScales(tileStatesBarLayout),
    slot: new Float32Array(count),
    referenceX: 0,
  };
  const runStartMs = new Float64Array(rowCount).fill(NaN);
  const runEndMs = new Float64Array(rowCount);
  const runSlot = new Float64Array(rowCount);
  // per row and coverage state, the open run's time in the state
  const runStateMs = new Float64Array(rowCount * MAX_COVERAGE_STATES);
  const addRun = (row: number, idx: number) => {
    addRect(
      rects,
      idx,
      runStartMs[row],
      runEndMs[row],
      row,
      runSlot[row],
      runStateMs,
      row * MAX_COVERAGE_STATES,
      1 / (runEndMs[row] - runStartMs[row]),
    );
  };

  const { rows, stateIdxs, startsMs, endsMs, slots } = states;
  let idx = 0;
  for (let i = 0; i < states.count; i++) {
    const row = rows[i];
    const startMs = startsMs[i];
    const endMs = endsMs[i];
    const slot = slots[i];
    const first = row * MAX_COVERAGE_STATES;
    if (endsRun(runStartMs[row], runSlot[row], startMs, endMs, slot, binMs)) {
      addRun(row, idx++);
      runStartMs[row] = NaN;
      for (let j = 0; j < MAX_COVERAGE_STATES; j++) runStateMs[first + j] = 0;
    }
    if (endMs - startMs >= binMs) {
      addOneHotRect(rects, idx++, startMs, endMs, row, slot, stateIdxs[i]);
      continue;
    }
    if (Number.isNaN(runStartMs[row])) {
      runStartMs[row] = startMs;
      runSlot[row] = slot;
    }
    runStateMs[first + stateIdxs[i]] += endMs - startMs;
    runEndMs[row] = endMs;
  }
  for (let row = 0; row < rowCount; row++) {
    if (!Number.isNaN(runStartMs[row])) addRun(row, idx++);
  }
  return { binMs, edges: rects.edges, bar: rects.bar, slot: rects.slot, count };
}

/** Each TileState's index among the coverage states, -1 if not drawn */
function getStateIdxs(states: TileState[]) {
  return Array.from({ length: tileStatesSet.size }, (_, state) =>
    states.indexOf(state),
  );
}

/** Merges a response's states into every level of each track */
export function mergeTileStatesResponse(
  res: TimelineTileStates,
  tiles: Tile[] | undefined,
): MergedTileStates {
  const referenceSlot =
    res.chunks.find((chunk) => chunk.reference_slot != null)?.reference_slot ??
    NaN;
  const levels: MergedLevels = { execrp: [], replay: [] };
  const firstChunk = res.chunks[0];
  if (!firstChunk) return { levels, referenceSlot };

  const tileNs = tileStatesTileNs[res.granularity];
  const tileStartNs = (firstChunk.chunk_ts / tileNs) * tileNs;
  const states = getRowStates(res, tiles, tileStartNs, referenceSlot);
  for (const kind of tileKinds) {
    const rowCount = getTileRows(tiles, kind).length;
    levels[kind] = mergeBinsMs[res.granularity].map((binMs) =>
      mergeLevel(states[kind], binMs, rowCount),
    );
  }
  return { levels, referenceSlot };
}

function concatLevel(
  acc: MergedLevel,
  add: MergedLevel,
  addSlotShift: number,
): MergedLevel {
  const edges = new Float32Array(acc.edges.length + add.edges.length);
  edges.set(acc.edges);
  edges.set(add.edges, acc.edges.length);
  const bar = new Uint16Array(acc.bar.length + add.bar.length);
  bar.set(acc.bar);
  bar.set(add.bar, acc.bar.length);
  const slot = new Float32Array(acc.count + add.count);
  slot.set(acc.slot);
  for (let i = 0; i < add.count; i++) {
    slot[acc.count + i] = add.slot[i] + addSlotShift;
  }
  return { binMs: acc.binMs, edges, bar, slot, count: acc.count + add.count };
}

// add's slots are addSlotShift from acc's reference slot
export function concatLevels(
  acc: MergedLevel[],
  add: MergedLevel[],
  addSlotShift: number,
): MergedLevel[] {
  if (!add.length) return acc;
  if (!acc.length) return add;
  return acc.map((level) => {
    const addLevel = add.find(({ binMs }) => binMs === level.binMs);
    return addLevel ? concatLevel(level, addLevel, addSlotShift) : level;
  });
}

// A level is kept if it has at most this fraction of the last kept level's rects
const KEPT_LEVEL_RATIO = 3 / 4;

// the finer level shows in place of a dropped one
export function pruneLevels(levels: MergedLevel[]): MergedLevel[] {
  const kept: MergedLevel[] = [];
  for (const level of levels) {
    const keptCount = kept.at(-1)?.count ?? Infinity;
    if (level.count <= keptCount * KEPT_LEVEL_RATIO) kept.push(level);
  }
  return kept;
}
