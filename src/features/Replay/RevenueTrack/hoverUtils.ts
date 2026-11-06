import { getDefaultStore } from "jotai";
import { referenceNsAtom } from "../atoms.ts";
import { calcAbsoluteNs } from "../utils.ts";
import type { HoveredRect } from "../useHoveredPosition.ts";
import { clientXToTs, clientYToWorldY } from "../hoverUtils.ts";
import {
  maxHeightRatio,
  maxY,
  minY,
  type RevenueScale,
  type RevenueSeries,
  type TxnMetaDetails,
} from "./consts.ts";
import { getRevenueRatio } from "./scale.ts";
import {
  getSeriesColumns,
  txnMetaCache,
  type TxnMetaColumns,
} from "./txnMeta/txnMetaCache.ts";
import type { RendererObj } from "./utils.ts";

const store = getDefaultStore();

const HOVER_TOLERANCE_PX = 2;
const MIN_SEARCH_WINDOW_MS = 10;

function getLongestBarMs(): number {
  return txnMetaCache.reduceMeta(MIN_SEARCH_WINDOW_MS, (max, meta) =>
    Math.max(max, meta.maxBarMs),
  );
}

export interface TxnAtPoint {
  slot: number;
  txnIdx: number;
  ms: number;
  /**
   * The matched txn's details, extracted from the row the hit-test resolved.
   * Carried through so the tooltip never re-searches the cache around the
   * cursor time — a search that can miss near tile boundaries because the
   * hit-test window includes the min-bar width and hover tolerance.
   */
  meta: TxnMetaDetails;
}

/**
 * The txn bar at a point in the nonAgg view. For overlaps, get the
 * tallest (highest) value
 */
export function findHighestTxnAtPoint(
  rendererObj: RendererObj,
  type: RevenueSeries,
  scale: RevenueScale,
  clientX: number,
  clientY: number,
  rect: HoveredRect,
): TxnAtPoint | undefined {
  const { camera, resources } = rendererObj.nonAggResources;
  const { uniforms } = resources.material;
  const maxValue = BigInt(uniforms.uMaxValue.value as number);
  const rows = uniforms.uRows.value as number;
  if (maxValue <= 0n) return;

  const { ms, toleranceMs, minBarMs } = xToMs(rendererObj, clientX, rect);

  // rows stack top-down in [minY, maxY]
  const y = clientYToWorldY(rect, clientY, camera.top, camera.bottom);
  const rowHeight = (maxY - minY) / rows;
  const row = rows - 1 - Math.floor((y - minY) / rowHeight);
  if (row < 0 || row >= rows) return;
  const yInRow = (((y - minY) % rowHeight) + rowHeight) % rowHeight;

  let best: { data: TxnMetaColumns; i: number; value: bigint } | undefined;
  // A min-width bar's drawn end can extend past its real commit end (its
  // owning tile), so a hit near a tile boundary can match a txn owned by an
  // earlier tile. Reach the lower bound back by minBarMs to include it.
  for (const data of getOverlappingColumns(
    ms - toleranceMs - minBarMs,
    ms + toleranceMs + getLongestBarMs(),
  )) {
    const columns = getSeriesColumns(data, type);
    for (let i = 0; i < data.txn_exec_idx.length; i++) {
      if (rows > 1 && data.txn_exec_idx[i] !== row) continue;
      if (!isHit(data, i, ms, toleranceMs, minBarMs)) continue;

      const value = sumColumns(columns, i);
      if (value > 0n && (!best || value > best.value)) {
        best = { data, i, value };
      }
    }
  }
  if (!best) return;

  const height =
    rowHeight * maxHeightRatio * getRevenueRatio(scale, maxValue, best.value);
  if (yInRow > height) return;

  const { data, i } = best;
  return {
    slot: data.slots[i],
    txnIdx: data.txn_idx[i],
    ms,
    meta: extractTxnMeta(data, i),
  };
}

function extractTxnMeta(data: TxnMetaColumns, i: number): TxnMetaDetails {
  return {
    execIdx: data.txn_exec_idx[i],
    transactionFee: data.txn_transaction_fee[i],
    priorityFee: data.txn_priority_fee[i],
    tips: data.txn_tips[i],
    loadStartMs: data.txn_load_start_ms[i],
  };
}

function xToMs(rendererObj: RendererObj, clientX: number, rect: HoveredRect) {
  const { cameraReferenceMs, camera, resources } = rendererObj.nonAggResources;
  // device px
  const minBarPx = resources.material.uniforms.uMinBarPx.value as number;

  const visibleStartMs = cameraReferenceMs + camera.left;
  const visibleEndMs = cameraReferenceMs + camera.right;
  const ms = clientXToTs(rect, clientX, [visibleStartMs, visibleEndMs]);

  const canvasCssPx = rendererObj.renderer.domElement.clientWidth || 1;
  const msPerCssPx = (visibleEndMs - visibleStartMs) / canvasCssPx;
  const pixelRatio = rendererObj.renderer.getPixelRatio() || 1;
  return {
    ms,
    toleranceMs: HOVER_TOLERANCE_PX * msPerCssPx,
    minBarMs: (minBarPx / pixelRatio) * msPerCssPx,
  };
}

/** Whether the txn's drawn bar spans ms, within toleranceMs */
function isHit(
  data: TxnMetaColumns,
  txnIdx: number,
  ms: number,
  toleranceMs: number,
  minBarMs: number,
): boolean {
  const startMs = data.txn_load_start_ms[txnIdx];
  const endMs = data.txn_commit_end_ms[txnIdx];
  if (endMs <= startMs) return false;
  const barEndMs = startMs + Math.max(endMs - startMs, minBarMs);
  return ms >= startMs - toleranceMs && ms <= barEndMs + toleranceMs;
}

function sumColumns(columns: bigint[][], txnIdx: number): bigint {
  let value = 0n;
  for (const column of columns) value += column[txnIdx];
  return value;
}

function getOverlappingColumns(
  startMs: number,
  endMs: number,
): TxnMetaColumns[] {
  const referenceNs = store.get(referenceNsAtom) ?? 0n;
  return txnMetaCache.getDataInRange(
    calcAbsoluteNs(referenceNs, startMs),
    calcAbsoluteNs(referenceNs, endMs),
  ).data;
}
