import { getDefaultStore } from "jotai";
import { tilesAtom } from "../../../api/atoms.ts";
import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom } from "../atoms.ts";
import type { HoveredExecrpTxn } from "../atoms.ts";
import { calcAbsoluteNs } from "../utils.ts";
import { BAR_HEIGHT_RATIO } from "./consts.ts";
import { tileStatesCaches, type TileStateColumns } from "./tileStatesCache.ts";
import { getTileRows, type RendererObj } from "./utils.ts";

const store = getDefaultStore();

const HOVER_TOLERANCE_PX = 2;
const SEARCH_WINDOW_MS = 1_000;

export interface TrackPoint {
  fracX: number;
  fracY: number;
  widthPx: number;
}

function getDataTilesInRange(
  granularity: TileStatesGranularity,
  startMs: number,
  endMs: number,
): TileStateColumns[] {
  const referenceNs = store.get(referenceNsAtom) ?? 0n;
  return tileStatesCaches[granularity].getDataInRange(
    calcAbsoluteNs(referenceNs, startMs),
    calcAbsoluteNs(referenceNs, endMs),
  ).data;
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
): { data: TileStateColumns; i: number } | undefined {
  let best:
    | {
        data: TileStateColumns;
        i: number;
        distMs: number;
        centerDistMs: number;
      }
    | undefined;
  for (const data of getDataTilesInRange(
    granularity,
    ms - toleranceMs,
    ms + toleranceMs,
  )) {
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
      best = { data, i, distMs, centerDistMs };
    }
  }
  return best;
}

function findHoveredStage(
  data: TileStateColumns,
  i: number,
  ms: number,
): TileState | undefined {
  const tileIdx = data.txn_tile[i];
  const txnStart = data.txn_start_ms[i];
  const txnEnd = data.txn_end_ms[i];
  let best: { state: TileState; distMs: number } | undefined;
  for (let j = 0; j < data.state.length; j++) {
    if (data.state_tile[j] !== tileIdx) continue;
    const start = data.state_start_ms[j];
    const end = data.state_end_ms[j];
    if (end <= txnStart || start >= txnEnd) continue;
    const distMs = ms < start ? start - ms : ms > end ? ms - end : 0;
    if (!best || distMs < best.distMs) best = { state: data.state[j], distMs };
  }
  return best?.state;
}

/**
 * Which txn (and execution stage) is under the cursor on the execrp track, with
 * its state durations. txn granularity only.
 */
export function findTxnAtCursor(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
  point: TrackPoint,
): HoveredExecrpTxn | undefined {
  if (rendererObj.config.kind !== "execrp") return;
  const granularity = rendererObj.renderedGranularity;
  if (granularity !== TileStatesGranularityEnum.txn) return;
  const row = findTileRowAtCursor(rendererObj, visibleRangeMs, point);
  if (!row) return;

  const column = findNearestTxnColumn(granularity, row);
  if (!column) return;
  const { data, i } = column;
  const slot = data.txn_slot[i];
  const txnIdx = data.txn_idx[i];
  const states = getTxnStateDurations(slot, txnIdx, row.ms);
  if (!states) return;
  return {
    slot,
    txnIdx,
    ms: row.ms,
    state: findHoveredStage(data, i, row.ms),
    states,
  };
}

interface StateInterval {
  state: TileState;
  startMs: number;
  endMs: number;
}

function getStateIntervals(
  data: TileStateColumns,
  tileIdx: number,
  startMs: number,
  endMs: number,
): StateInterval[] {
  const intervals: StateInterval[] = [];
  for (let j = 0; j < data.state.length; j++) {
    if (data.state_tile[j] !== tileIdx) continue;
    if (data.state_start_ms[j] < startMs || data.state_end_ms[j] > endMs) {
      continue;
    }
    intervals.push({
      state: data.state[j],
      startMs: data.state_start_ms[j],
      endMs: data.state_end_ms[j],
    });
  }
  return intervals;
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
  dataTiles: TileStateColumns[],
  slot: number,
  txnIdx: number,
): TxnStates | undefined {
  const fragments: Record<keyof TxnStates, SegmentFragments | undefined> = {
    exec: undefined,
    sigverify: undefined,
  };
  for (const data of dataTiles) {
    for (let i = 0; i < data.txn_idx.length; i++) {
      if (data.txn_slot[i] !== slot || data.txn_idx[i] !== txnIdx) continue;

      const tileIdx = data.txn_tile[i];
      const startMs = data.txn_start_ms[i];
      const endMs = data.txn_end_ms[i];
      const errorCode = data.txn_error_code[i];
      const intervals = getStateIntervals(data, tileIdx, startMs, endMs);
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
