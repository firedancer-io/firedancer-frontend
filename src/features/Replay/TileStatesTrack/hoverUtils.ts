import { getDefaultStore } from "jotai";
import { tilesAtom } from "../../../api/atoms.ts";
import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom } from "../atoms.ts";
import { calcAbsoluteNs } from "../utils.ts";
import type { TrackPoint } from "../Tooltip/useTrackHover.ts";
import { BAR_HEIGHT_PX, ROW_HEIGHT_PX } from "./consts.ts";
import {
  tileStatesCaches,
  type TileStateColumns,
  type TileStatesDataTile,
} from "./tileStatesCache.ts";
import { getTileRows, type RendererObj } from "./utils.ts";

const store = getDefaultStore();

/** Slack in px around a segment so brief ones are still hoverable */
const HOVER_TOLERANCE_PX = 2;

/**
 * How far from the hovered time to look for an item's segments. A txn's
 * segments are within a few ms of any point on it, and a slot's replay is
 * usually well under this, so this only needs to cover the data tiles next to
 * the hovered one.
 */
const SEARCH_WINDOW_MS = 1_000;

function getDataTilesInRange(
  granularity: TileStatesGranularity,
  startMs: number,
  endMs: number,
): TileStatesDataTile[] {
  const referenceNs = store.get(referenceNsAtom) ?? 0n;
  return tileStatesCaches[granularity].getTilesInRange(
    calcAbsoluteNs(referenceNs, startMs),
    calcAbsoluteNs(referenceNs, endMs),
  ).tiles;
}

interface RowAtPoint {
  /** The row's tile */
  tileIdx: number;
  /** The point's time (relative ms) */
  ms: number;
  tolMs: number;
}

/**
 * The tile and time at a point, if it's on a row's bar. Rows stack top-down
 * with each bar at the bottom of its row, like appendTileStates. A tile's
 * segments don't overlap, so lanes don't matter.
 */
function findRowAtPoint(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
  { fracX, fracY }: TrackPoint,
): RowAtPoint | undefined {
  const rows = getTileRows(store.get(tilesAtom), rendererObj.kind);
  const rowPos = fracY * rows.length;
  const row = Math.floor(rowPos);
  const barFrac = BAR_HEIGHT_PX / ROW_HEIGHT_PX;
  if (row < 0 || row >= rows.length || rowPos - row < 1 - barFrac) return;

  const visibleDurationMs = visibleRangeMs[1] - visibleRangeMs[0];
  const canvasCssPx = rendererObj.renderer.domElement.clientWidth || 1;
  return {
    tileIdx: rows[row].tileIdx,
    ms: visibleRangeMs[0] + fracX * visibleDurationMs,
    tolMs: HOVER_TOLERANCE_PX * (visibleDurationMs / canvasCssPx),
  };
}

interface SegmentColumns {
  tile: number[];
  startMs: number[];
  endMs: number[];
}

/** The segment on the row's tile nearest its time, within the tolerance */
function findNearestSegment(
  granularity: TileStatesGranularity,
  { tileIdx, ms, tolMs }: RowAtPoint,
  getColumns: (data: TileStateColumns) => SegmentColumns,
): { data: TileStateColumns; i: number } | undefined {
  let best: { data: TileStateColumns; i: number; distMs: number } | undefined;
  for (const { data } of getDataTilesInRange(
    granularity,
    ms - tolMs,
    ms + tolMs,
  )) {
    const { tile, startMs, endMs } = getColumns(data);
    for (let i = 0; i < tile.length; i++) {
      if (tile[i] !== tileIdx) continue;
      const distMs =
        ms < startMs[i] ? startMs[i] - ms : ms > endMs[i] ? ms - endMs[i] : 0;
      if (distMs > tolMs || (best && best.distMs <= distMs)) continue;
      best = { data, i, distMs };
    }
  }
  return best;
}

export interface ExecrpTxnAtPoint {
  slot: number;
  txnIdx: number;
  /** The point's time (relative ms) */
  ms: number;
}

/**
 * The txn segment (a sigverify or an execution) at a point on the execrp
 * track. Only the per-txn view has txns, since agg buckets and txn_batch rows
 * each cover many.
 */
export function findExecrpTxnAtPoint(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
  point: TrackPoint,
): ExecrpTxnAtPoint | undefined {
  if (rendererObj.kind !== "execrp") return;
  const granularity = rendererObj.renderedGranularity;
  if (granularity !== TileStatesGranularityEnum.txn) return;
  const row = findRowAtPoint(rendererObj, visibleRangeMs, point);
  if (!row) return;

  const segment = findNearestSegment(granularity, row, (data) => ({
    tile: data.txn_tile,
    startMs: data.txn_start_ms,
    endMs: data.txn_end_ms,
  }));
  if (!segment) return;
  const { data, i } = segment;
  return { slot: data.txn_slot[i], txnIdx: data.txn_idx[i], ms: row.ms };
}

export interface ReplaySlotAtPoint {
  slot: number;
  tileIdx: number;
  /** The tile states cache the track is drawn from */
  granularity: TileStatesGranularity;
  /** The point's time (relative ms) */
  ms: number;
}

/** The slot segment (a slot's replay on a tile) at a point on the replay track */
export function findReplaySlotAtPoint(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
  point: TrackPoint,
): ReplaySlotAtPoint | undefined {
  if (rendererObj.kind !== "replay") return;
  // undefined in the agg view
  const granularity = rendererObj.renderedGranularity;
  if (!granularity) return;
  const row = findRowAtPoint(rendererObj, visibleRangeMs, point);
  if (!row) return;

  const segment = findNearestSegment(granularity, row, (data) => ({
    tile: data.slot_tile,
    startMs: data.slot_start_ms,
    endMs: data.slot_end_ms,
  }));
  if (!segment) return;
  return {
    slot: segment.data.slot_slot[segment.i],
    tileIdx: row.tileIdx,
    granularity,
    ms: row.ms,
  };
}

/** A run of a tile's states, e.g. a txn's execution or a slot's replay */
interface Segment {
  startMs: number;
  endMs: number;
  /** Total ms per state. Zero length states aren't drawn, so they're missing */
  stateMs: Map<TileState, number>;
}

/** Total ms per state in a slice of the state columns */
function sumStateMs(data: TileStateColumns, lo: number, cnt: number) {
  const stateMs = new Map<TileState, number>();
  for (let j = lo; j < lo + cnt; j++) {
    const state = data.state[j];
    const durationMs = data.state_end_ms[j] - data.state_start_ms[j];
    stateMs.set(state, (stateMs.get(state) ?? 0) + durationMs);
  }
  return stateMs;
}

/**
 * Tile states aren't filtered to their owning data tile, so a segment across a
 * data tile edge is in both. Copies clipped at the edge don't overlap, so join
 * them; otherwise keep the longest.
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

/** A sigverify, or a txn's execution stages, on one tile */
export interface TxnSegment extends Segment {
  tileIdx: number;
  errorCode: number | null;
}

export interface TxnStates {
  exec: TxnSegment | undefined;
  sigverify: TxnSegment | undefined;
}

/** A txn's segments from the per-txn tile states cache, searched near ms */
export function getTxnStates(
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
  for (const { data } of dataTiles) {
    for (let i = 0; i < data.txn_idx.length; i++) {
      if (data.txn_slot[i] !== slot || data.txn_idx[i] !== txnIdx) continue;

      const segment: TxnSegment = {
        tileIdx: data.txn_tile[i],
        startMs: data.txn_start_ms[i],
        endMs: data.txn_end_ms[i],
        errorCode: data.txn_error_code[i],
        stateMs: sumStateMs(data, data.txn_state_lo[i], data.txn_state_cnt[i]),
      };
      const key = segment.stateMs.has(TileState.Sigverify)
        ? "sigverify"
        : "exec";
      states[key] = mergeSegment(states[key], segment);
    }
  }
  if (states.exec || states.sigverify) return states;
}

/** A slot's replay on one tile */
export interface ReplaySlotSegment extends Segment {
  slot: number;
}

/** A slot's replay on a tile from a tile states cache, searched near ms */
export function getReplaySlotSegment({
  slot,
  tileIdx,
  granularity,
  ms,
}: ReplaySlotAtPoint): ReplaySlotSegment | undefined {
  let segment: ReplaySlotSegment | undefined;
  const dataTiles = getDataTilesInRange(
    granularity,
    ms - SEARCH_WINDOW_MS,
    ms + SEARCH_WINDOW_MS,
  );
  for (const { data } of dataTiles) {
    for (let i = 0; i < data.slot_slot.length; i++) {
      if (data.slot_slot[i] !== slot || data.slot_tile[i] !== tileIdx) continue;
      segment = mergeSegment(segment, {
        slot,
        startMs: data.slot_start_ms[i],
        endMs: data.slot_end_ms[i],
        stateMs: sumStateMs(
          data,
          data.slot_state_lo[i],
          data.slot_state_cnt[i],
        ),
      });
    }
  }
  return segment;
}
