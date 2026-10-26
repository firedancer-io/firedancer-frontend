import { strokeLineWidth } from "../../Overview/SlotPerformance/useTileSparkline";

export const AGG_CPU_CHART_ID = "agg-cpu-track";

/** Max utilization value reported by the server (fully busy) */
export const MAX_UTILIZATION = 250;

/** Server rejects queries with more tiles than this */
export const MAX_QUERY_TILES = 256;

/** Tile kinds shown until the user changes the series selection */
export const DEFAULT_SELECTED_KINDS = ["execrp", "pack", "replay"];

/** Space reserved above the rows so track controls don't cover them */
export const topInsetPx = 26;
export const bottomInsetPx = 4;
/** matches the overview tile sparkline height */
export const rowHeightPx = 24;
export const rowGapPx = 2;
export const strokeWidthPx = strokeLineWidth;
/** Vertical padding inside a row so the stroke isn't clipped at 0 / 250 */
export const rowPaddingPx = strokeWidthPx / 2;

export function getCpuTrackHeight(numRows: number) {
  return (
    topInsetPx + numRows * (rowHeightPx + rowGapPx) - rowGapPx + bottomInsetPx
  );
}

export function getRowTopPx(rowIdx: number) {
  return topInsetPx + rowIdx * (rowHeightPx + rowGapPx);
}

export interface CpuRow {
  /** unique across rows, unlike the label */
  key: string;
  label: string;
  /** indices into the queried tiles list (same as `summary.tiles` indices) */
  tileIdxs: number[];
}
