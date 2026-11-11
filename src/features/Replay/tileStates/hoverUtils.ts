import { getDefaultStore } from "jotai";
import { tilesAtom } from "../../../api/atoms.ts";
import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom } from "../atoms.ts";
import type { HoveredExecrpLthash, HoveredExecrpTxn } from "../atoms.ts";
import { calcAbsoluteNs, calcRelativeMs } from "../utils.ts";
import {
  BAR_HEIGHT_RATIO,
  getTileRows,
  tileStatesTileNs,
  trackStates,
} from "./consts.ts";
import { tileStatesCaches, type TileStatesData } from "./tileStatesCache.ts";
import { MAX_COVERAGE_STATES } from "./tileStatesRects.ts";
import { getRowOfTile, type RendererObj } from "./utils.ts";

const store = getDefaultStore();

const HOVER_TOLERANCE_PX = 2;
const SEARCH_WINDOW_MS = 1_000;
// below the 1ns step of state and txn edges, above their float error
const HALF_NS_MS = 0.5e-6;

export interface TrackPoint {
  fracX: number;
  fracY: number;
  widthPx: number;
}

export interface DataTileInRange {
  data: TileStatesData;
  startMs: number;
  granularity: TileStatesGranularity;
}

function getDataTilesInRange(
  granularity: TileStatesGranularity,
  startMs: number,
  endMs: number,
): DataTileInRange[] {
  const referenceNs = store.get(referenceNsAtom) ?? 0n;
  const tileNs = tileStatesTileNs[granularity];
  const cache = tileStatesCaches[granularity];
  const endNs = calcAbsoluteNs(referenceNs, endMs);
  const tiles: DataTileInRange[] = [];
  for (
    let tileStartNs = (calcAbsoluteNs(referenceNs, startMs) / tileNs) * tileNs;
    tileStartNs <= endNs;
    tileStartNs += tileNs
  ) {
    const [data] = cache.getDataInRange(tileStartNs, tileStartNs).data;
    if (data) {
      tiles.push({
        data,
        startMs: calcRelativeMs(referenceNs, tileStartNs),
        granularity,
      });
    }
  }
  return tiles;
}

interface TileRowAtCursor {
  tileIdx: number;
  ms: number;
  toleranceMs: number;
}

function findTileRowAtCursor(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
  { fracX, fracY, widthPx }: TrackPoint,
): TileRowAtCursor | undefined {
  const rows = getTileRows(store.get(tilesAtom), rendererObj.config.kind);
  const rowPos = fracY * rows.length;
  const row = Math.floor(rowPos);
  if (row < 0 || row >= rows.length || rowPos - row < 1 - BAR_HEIGHT_RATIO) {
    return;
  }

  const visibleDurationMs = visibleRangeMs[1] - visibleRangeMs[0];
  return {
    tileIdx: rows[row].tileIdx,
    ms: visibleRangeMs[0] + fracX * visibleDurationMs,
    toleranceMs: HOVER_TOLERANCE_PX * (visibleDurationMs / (widthPx || 1)),
  };
}

function findNearestTxnColumn(
  granularity: TileStatesGranularity,
  { tileIdx, ms, toleranceMs }: TileRowAtCursor,
): { tile: DataTileInRange; i: number; distMs: number } | undefined {
  let best:
    | {
        tile: DataTileInRange;
        i: number;
        distMs: number;
        centerDistMs: number;
      }
    | undefined;
  for (const tile of getDataTilesInRange(
    granularity,
    ms - toleranceMs,
    ms + toleranceMs,
  )) {
    const { data } = tile;
    for (let i = 0; i < data.txn_tile.length; i++) {
      if (data.txn_tile[i] !== tileIdx) continue;
      const start = data.txn_start_ms[i];
      const end = data.txn_end_ms[i];
      const distMs = ms < start ? start - ms : ms > end ? ms - end : 0;
      if (distMs > toleranceMs) continue;
      // Break distance ties by nearest center
      const centerDistMs = Math.abs(ms - (start + end) / 2);
      if (
        best &&
        (best.distMs < distMs ||
          (best.distMs === distMs && best.centerDistMs <= centerDistMs))
      ) {
        continue;
      }
      best = { tile, i, distMs, centerDistMs };
    }
  }
  return best;
}

interface StateInterval {
  state: TileState;
  startMs: number;
  endMs: number;
}

/** A tile row's states overlapping a range, in ms from the reference */
function getRowStateIntervals(
  { data, startMs: tileStartMs, granularity }: DataTileInRange,
  tileIdx: number,
  startMs: number,
  endMs: number,
): StateInterval[] {
  const row = getRowOfTile("execrp").get(tileIdx);
  const level = data.levels.execrp[0];
  if (row === undefined || !level) return [];
  const states = trackStates.execrp[granularity];
  const { edges, bar, count } = level;
  const stride = MAX_COVERAGE_STATES + 1;
  const intervals: StateInterval[] = [];
  for (let i = 0; i < count; i++) {
    if (bar[i * stride] !== row) continue;
    const stateStartMs = tileStartMs + edges[i * 4] + edges[i * 4 + 1];
    const stateEndMs = tileStartMs + edges[i * 4 + 2] + edges[i * 4 + 3];
    if (
      stateEndMs <= startMs + HALF_NS_MS ||
      stateStartMs >= endMs - HALF_NS_MS
    ) {
      continue;
    }
    let stateIdx = 0;
    while (stateIdx < states.length && !bar[i * stride + 1 + stateIdx]) {
      stateIdx++;
    }
    if (stateIdx === states.length) continue;
    intervals.push({
      state: states[stateIdx],
      startMs: stateStartMs,
      endMs: stateEndMs,
    });
  }
  return intervals;
}

function findHoveredStage(
  tile: DataTileInRange,
  i: number,
  ms: number,
): TileState | undefined {
  const { data } = tile;
  let best: { state: TileState; distMs: number } | undefined;
  for (const { state, startMs: start, endMs: end } of getRowStateIntervals(
    tile,
    data.txn_tile[i],
    data.txn_start_ms[i],
    data.txn_end_ms[i],
  )) {
    const distMs = ms < start ? start - ms : ms > end ? ms - end : 0;
    if (!best || distMs < best.distMs) best = { state, distMs };
  }
  return best?.state;
}

/** The txn (and execution stage) near the cursor, with its state durations */
function findTxnNearCursor(
  granularity: TileStatesGranularity,
  row: TileRowAtCursor,
): { txn: HoveredExecrpTxn; distMs: number } | undefined {
  const column = findNearestTxnColumn(granularity, row);
  if (!column) return;
  const { tile, i, distMs } = column;
  const { data } = tile;
  const slot = data.txn_slot[i];
  const txnIdx = data.txn_idx[i];
  const states = getTxnStateDurations(slot, txnIdx, row.ms);
  if (!states) return;
  return {
    txn: {
      slot,
      txnIdx,
      ms: row.ms,
      state: findHoveredStage(tile, i, row.ms),
      states,
    },
    distMs,
  };
}

function findLthashNearCursor(
  granularity: TileStatesGranularity,
  { tileIdx, ms, toleranceMs }: TileRowAtCursor,
): { lthash: HoveredExecrpLthash; distMs: number } | undefined {
  let best: { lthash: HoveredExecrpLthash; distMs: number } | undefined;
  for (const tile of getDataTilesInRange(
    granularity,
    ms - toleranceMs,
    ms + toleranceMs,
  )) {
    const { data } = tile;
    for (let i = 0; i < data.lthash_tile.length; i++) {
      if (data.lthash_tile[i] !== tileIdx) continue;
      const startMs = data.lthash_start_ms[i];
      const endMs = data.lthash_end_ms[i];
      const distMs = ms < startMs ? startMs - ms : ms > endMs ? ms - endMs : 0;
      if (distMs > toleranceMs || (best && best.distMs <= distMs)) continue;
      best = {
        lthash: {
          slot: data.lthash_slot[i],
          tileIdx,
          startMs,
          endMs,
        },
        distMs,
      };
    }
  }
  return best;
}

type ExecrpHover =
  | { txn: HoveredExecrpTxn; lthash?: undefined }
  | { txn?: undefined; lthash: HoveredExecrpLthash };

export function findExecrpHoverAtCursor(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
  point: TrackPoint,
): ExecrpHover | undefined {
  if (rendererObj.config.kind !== "execrp") return;
  const granularity = rendererObj.renderedGranularity;
  if (granularity !== TileStatesGranularityEnum.txn) return;
  const row = findTileRowAtCursor(rendererObj, visibleRangeMs, point);
  if (!row) return;

  const txn = findTxnNearCursor(granularity, row);
  const lthash = findLthashNearCursor(granularity, row);
  if (lthash && (!txn || lthash.distMs < txn.distMs)) {
    return { lthash: lthash.lthash };
  }
  if (txn) return { txn: txn.txn };
}

function getStateIntervals(
  tile: DataTileInRange,
  tileIdx: number,
  startMs: number,
  endMs: number,
): StateInterval[] {
  return getRowStateIntervals(tile, tileIdx, startMs, endMs).filter(
    (interval) =>
      interval.startMs >= startMs - HALF_NS_MS &&
      interval.endMs <= endMs + HALF_NS_MS,
  );
}

/**
 * Total ms per state. A txn spanning a data-tile edge appears in both tiles,
 * and the copies can overlap, so count each state's overlapping time once.
 */
function sumStateDurations(intervals: StateInterval[]) {
  const stateMs = new Map<TileState, number>();
  const sorted = [...intervals].sort(
    (a, b) => a.state - b.state || a.startMs - b.startMs,
  );
  let coveredState: TileState | undefined;
  let coveredEndMs = -Infinity;
  for (const { state, startMs, endMs } of sorted) {
    if (state !== coveredState) {
      coveredState = state;
      coveredEndMs = -Infinity;
    }
    const addedMs = endMs - Math.max(startMs, coveredEndMs);
    if (addedMs > 0) stateMs.set(state, (stateMs.get(state) ?? 0) + addedMs);
    coveredEndMs = Math.max(coveredEndMs, endMs);
  }
  return stateMs;
}

export interface TxnSegment {
  tileIdx: number;
  startMs: number;
  endMs: number;
  errorCode: number | null;
  stateMs: Map<TileState, number>;
}

export interface TxnStates {
  exec: TxnSegment | undefined;
  sigverify: TxnSegment | undefined;
}

interface SegmentFragments extends Omit<TxnSegment, "stateMs"> {
  intervals: StateInterval[];
}

export function mergeTxnSegments(
  dataTiles: DataTileInRange[],
  slot: number,
  txnIdx: number,
): TxnStates | undefined {
  const fragments: Record<keyof TxnStates, SegmentFragments | undefined> = {
    exec: undefined,
    sigverify: undefined,
  };
  for (const tile of dataTiles) {
    const { data } = tile;
    for (let i = 0; i < data.txn_idx.length; i++) {
      if (data.txn_slot[i] !== slot || data.txn_idx[i] !== txnIdx) continue;

      const tileIdx = data.txn_tile[i];
      const startMs = data.txn_start_ms[i];
      const endMs = data.txn_end_ms[i];
      const errorCode = data.txn_error_code[i];
      const intervals = getStateIntervals(tile, tileIdx, startMs, endMs);
      const key = intervals.some(({ state }) => state === TileState.Sigverify)
        ? "sigverify"
        : "exec";

      const prev = fragments[key];
      fragments[key] = prev
        ? {
            tileIdx: prev.tileIdx,
            startMs: Math.min(prev.startMs, startMs),
            endMs: Math.max(prev.endMs, endMs),
            errorCode: errorCode ?? prev.errorCode,
            intervals: [...prev.intervals, ...intervals],
          }
        : { tileIdx, startMs, endMs, errorCode, intervals };
    }
  }

  const toSegment = (merged: SegmentFragments | undefined) => {
    if (!merged) return;
    const { intervals, ...segment } = merged;
    return { ...segment, stateMs: sumStateDurations(intervals) };
  };
  const states: TxnStates = {
    exec: toSegment(fragments.exec),
    sigverify: toSegment(fragments.sigverify),
  };
  if (states.exec || states.sigverify) return states;
}

export function getTxnStateDurations(
  slot: number,
  txnIdx: number,
  ms: number,
): TxnStates | undefined {
  const dataTiles = getDataTilesInRange(
    TileStatesGranularityEnum.txn,
    ms - SEARCH_WINDOW_MS,
    ms + SEARCH_WINDOW_MS,
  );
  return mergeTxnSegments(dataTiles, slot, txnIdx);
}
