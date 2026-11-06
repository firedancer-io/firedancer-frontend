import { getDefaultStore } from "jotai";
import { tilesAtom } from "../../../api/atoms.ts";
import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom } from "../atoms.ts";
import { calcAbsoluteNs } from "../utils.ts";
import { BAR_HEIGHT_RATIO } from "./consts.ts";
import { tileStatesCaches, type TileStateColumns } from "./tileStatesCache.ts";
import { getTileRows, type RendererObj } from "./utils.ts";

const store = getDefaultStore();

const HOVER_TOLERANCE_PX = 2;
const SEARCH_WINDOW_MS = 1_000;

/** Cursor position as a fraction from top left */
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
  const rows = getTileRows(store.get(tilesAtom), rendererObj.kind);
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

export interface ExecrpTxnAtPoint {
  slot: number;
  txnIdx: number;
  ms: number;
  state: TileState | undefined;
}

/**
 * The execution stage (Loading/Validate/Execute/…) on the given tile nearest ms
 */
function findHoveredStage(
  data: TileStateColumns,
  tileIdx: number,
  ms: number,
): TileState | undefined {
  let best: { state: TileState; distMs: number } | undefined;
  for (let j = 0; j < data.state.length; j++) {
    if (data.state_tile[j] !== tileIdx) continue;
    const start = data.state_start_ms[j];
    const end = data.state_end_ms[j];
    const distMs = ms < start ? start - ms : ms > end ? ms - end : 0;
    if (!best || distMs < best.distMs) best = { state: data.state[j], distMs };
  }
  return best?.state;
}

/**
 * Which txn (and execution stage) is under the cursor on the execrp track.
 * txn granularity only.
 */
export function findTxnAtCursor(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
  point: TrackPoint,
): ExecrpTxnAtPoint | undefined {
  if (rendererObj.kind !== "execrp") return;
  const granularity = rendererObj.renderedGranularity;
  if (granularity !== TileStatesGranularityEnum.txn) return;
  const row = findTileRowAtCursor(rendererObj, visibleRangeMs, point);
  if (!row) return;

  const column = findNearestTxnColumn(granularity, row);
  if (!column) return;
  const { data, i } = column;
  return {
    slot: data.txn_slot[i],
    txnIdx: data.txn_idx[i],
    ms: row.ms,
    state: findHoveredStage(data, data.txn_tile[i], row.ms),
  };
}

interface Segment {
  startMs: number;
  endMs: number;
  stateMs: Map<TileState, number>;
}

/** Total ms per state on the given tile within [startMs, endMs] */
function sumStateDurations(
  data: TileStateColumns,
  tileIdx: number,
  startMs: number,
  endMs: number,
) {
  const stateMs = new Map<TileState, number>();
  for (let j = 0; j < data.state.length; j++) {
    if (data.state_tile[j] !== tileIdx) continue;
    if (data.state_start_ms[j] < startMs || data.state_end_ms[j] > endMs) {
      continue;
    }
    const state = data.state[j];
    const durationMs = data.state_end_ms[j] - data.state_start_ms[j];
    stateMs.set(state, (stateMs.get(state) ?? 0) + durationMs);
  }
  return stateMs;
}

/**
 * A segment spanning a data-tile edge appears in both tiles. The clipped copies
 * don't overlap, so join them; otherwise keep the longest.
 */
function mergeSegment<T extends Segment>(prev: T | undefined, next: T): T {
  if (!prev) return next;
  if (prev.endMs <= next.startMs || next.endMs <= prev.startMs) {
    const stateMs = new Map(prev.stateMs);
    for (const [state, ms] of next.stateMs) {
      stateMs.set(state, (stateMs.get(state) ?? 0) + ms);
    }
    return {
      ...prev,
      startMs: Math.min(prev.startMs, next.startMs),
      endMs: Math.max(prev.endMs, next.endMs),
      stateMs,
    };
  }
  return prev.endMs - prev.startMs < next.endMs - next.startMs ? next : prev;
}

export interface TxnSegment extends Segment {
  tileIdx: number;
  errorCode: number | null;
}

export interface TxnStates {
  exec: TxnSegment | undefined;
  sigverify: TxnSegment | undefined;
}

export function getTxnStateDurations(
  slot: number,
  txnIdx: number,
  ms: number,
): TxnStates | undefined {
  const states: TxnStates = { exec: undefined, sigverify: undefined };
  const dataTiles = getDataTilesInRange(
    TileStatesGranularityEnum.txn,
    ms - SEARCH_WINDOW_MS,
    ms + SEARCH_WINDOW_MS,
  );
  for (const data of dataTiles) {
    for (let i = 0; i < data.txn_idx.length; i++) {
      if (data.txn_slot[i] !== slot || data.txn_idx[i] !== txnIdx) continue;

      const tileIdx = data.txn_tile[i];
      const startMs = data.txn_start_ms[i];
      const endMs = data.txn_end_ms[i];
      const segment: TxnSegment = {
        tileIdx,
        startMs,
        endMs,
        errorCode: data.txn_error_code[i],
        stateMs: sumStateDurations(data, tileIdx, startMs, endMs),
      };
      const key = segment.stateMs.has(TileState.Sigverify)
        ? "sigverify"
        : "exec";
      states[key] = mergeSegment(states[key], segment);
    }
  }
  if (states.exec || states.sigverify) return states;
}
