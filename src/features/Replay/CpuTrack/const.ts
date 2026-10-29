import type { Tile } from "../../../api/types";
import { strokeLineWidth } from "../../Overview/SlotPerformance/useTileSparkline";

export const AGG_CPU_CHART_ID = "agg-cpu-track";

export const MAX_UTILIZATION = 250; // utilization values are `0` (idle) to `250` (busy)

export const MAX_QUERY_TILES = 256;

export const DEFAULT_SELECTED_KINDS = ["execrp", "pack", "replay"];

/** Space reserved above the rows so track controls don't cover them. */
export const topInsetPx = 24;
export const rowHeightPx = 24;
export const rowGapPx = 2;
export const strokeWidthPx = strokeLineWidth;
export const rowPaddingPx = strokeWidthPx / 2;

export function getRowTopPx(rowIdx: number) {
  return topInsetPx + rowIdx * (rowHeightPx + rowGapPx);
}

export function getCpuTrackHeight(numRows: number) {
  return getRowTopPx(numRows) - rowGapPx;
}

export function getTileKey({ kind, kind_id }: Tile) {
  return `${kind}:${kind_id}`;
}

export interface CpuRow {
  key: string;
  label: string;
  tileIdxs: number[];
}
