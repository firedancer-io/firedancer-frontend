import { getDefaultStore } from "jotai";
import { referenceNsAtom } from "../atoms.ts";
import { calcAbsoluteNs } from "../utils.ts";
import type { TrackPoint } from "../Tooltip/useTrackHover.ts";
import {
  cameraMaxY,
  maxHeightRatio,
  maxY,
  minY,
  type RevenueScale,
  type RevenueSeries,
} from "./consts.ts";
import { getRevenueRatio } from "./scale.ts";
import {
  getSeriesColumns,
  txnMetaCache,
  type TxnMetaColumns,
  type TxnMetaTile,
} from "./txnMeta/txnMetaCache.ts";
import type { RendererObj } from "./utils.ts";

const store = getDefaultStore();

/** Slack in px around a bar so thin txns are still hoverable */
const HOVER_TOLERANCE_PX = 2;

/**
 * How far from the hovered time to look for a txn. Its commit end, which sets
 * the data tile it's in, is within a few ms of any point on its bar, so this
 * only needs to cover the data tiles next to the hovered one.
 */
const SEARCH_WINDOW_MS = 1_000;

export interface TxnAtPoint {
  slot: number;
  txnIdx: number;
  /** The point's time (relative ms) */
  ms: number;
}

/**
 * The txn bar at a point in the nonAgg view, mirroring the txn mesh shader's
 * layout. Bars overlap, so prefer the tallest bar containing the point, the
 * highest value. Splitting by row separates overlapping bars.
 */
export function findTxnAtPoint(
  rendererObj: RendererObj,
  type: RevenueSeries,
  scale: RevenueScale,
  { fracX, fracY }: TrackPoint,
): TxnAtPoint | undefined {
  const { cameraReferenceMs, camera, resources } = rendererObj.nonAggResources;
  // the shader's layout inputs, as set by refreshNonAggView
  const { uniforms } = resources.material;
  const maxValue = BigInt(uniforms.uMaxValue.value as number);
  const minBarMs = uniforms.uMinBarMs.value as number;
  const rows = uniforms.uRows.value as number;
  if (maxValue <= 0n) return;

  const visibleDurationMs = camera.right - camera.left;
  const ms = cameraReferenceMs + camera.left + fracX * visibleDurationMs;
  const canvasCssPx = rendererObj.renderer.domElement.clientWidth || 1;
  const tolMs = HOVER_TOLERANCE_PX * (visibleDurationMs / canvasCssPx);

  // The camera spans [minY, cameraMaxY], with the top inset above the rows in
  // [minY, maxY]. Rows stack top-down.
  const y = minY + (1 - fracY) * (cameraMaxY - minY);
  const rowHeight = (maxY - minY) / rows;
  const rowFromBottom = Math.floor((y - minY) / rowHeight);
  const row = rows - 1 - rowFromBottom;
  if (row < 0 || row >= rows) return;

  // bar height grows with value, so the tallest bar at ms has the highest value
  let best: { data: TxnMetaColumns; i: number; value: bigint } | undefined;
  for (const { data } of getNearbyTiles(ms - tolMs, ms + SEARCH_WINDOW_MS)) {
    const columns = getSeriesColumns(data, type);
    for (let i = 0; i < data.txn_exec_idx.length; i++) {
      if (rows > 1 && data.txn_exec_idx[i] !== row) continue;

      const startMs = data.txn_load_start_ms[i];
      const endMs = data.txn_commit_end_ms[i];
      if (endMs <= startMs) continue;
      const barEndMs = startMs + Math.max(endMs - startMs, minBarMs);
      if (ms < startMs - tolMs || barEndMs + tolMs < ms) continue;

      let value = 0n;
      for (const column of columns) value += column[i];
      if (!best || value > best.value) best = { data, i, value };
    }
  }
  if (!best) return;

  const height =
    rowHeight * maxHeightRatio * getRevenueRatio(scale, maxValue, best.value);
  const yInRow = y - minY - rowFromBottom * rowHeight;
  if (yInRow > height) return;

  const { data, i } = best;
  return { slot: data.slots[i], txnIdx: data.txn_idx[i], ms };
}

/** Timestamps are relative ms, like the cache */
export interface TxnMetaDetails {
  execIdx: number;
  transactionFee: bigint;
  priorityFee: bigint;
  tips: bigint;
  loadStartMs: number;
}

/**
 * Data tiles overlapping [startMs, endMs], including the live tile. Each holds
 * the txns whose commit end is in it.
 */
function getNearbyTiles(startMs: number, endMs: number): TxnMetaTile[] {
  const referenceNs = store.get(referenceNsAtom) ?? 0n;
  return txnMetaCache.getTilesInRange(
    calcAbsoluteNs(referenceNs, startMs),
    calcAbsoluteNs(referenceNs, endMs),
  ).tiles;
}

/** A txn's details from the txn meta cache, searched near ms */
export function getTxnMeta(
  slot: number,
  txnIdx: number,
  ms: number,
): TxnMetaDetails | undefined {
  for (const { data } of getNearbyTiles(
    ms - SEARCH_WINDOW_MS,
    ms + SEARCH_WINDOW_MS,
  )) {
    for (let i = 0; i < data.slots.length; i++) {
      if (data.slots[i] !== slot || data.txn_idx[i] !== txnIdx) continue;
      return {
        execIdx: data.txn_exec_idx[i],
        transactionFee: data.txn_transaction_fee[i],
        priorityFee: data.txn_priority_fee[i],
        tips: data.txn_tips[i],
        loadStartMs: data.txn_load_start_ms[i],
      };
    }
  }
}
