import { TileState } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import { convertToWebGlColor, type RgbColor } from "../../WebGl/webglUtils.ts";
import {
  transactionErrorOutlineColor,
  transactionSuccessOutlineColor,
} from "../../../colors.ts";
import {
  stateColors,
  TxnState,
} from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";

export type TileKind = "execrp" | "replay";

export const TXN_MAX_MS = 30_000; // 30s
export const BATCH_MAX_MS = 30 * 60_000; // 30min

export type TileStatesView = TileStatesGranularity | "agg";

export function getTileStatesView(spanMs: number): TileStatesView {
  if (spanMs < TXN_MAX_MS) return "txn";
  if (spanMs < BATCH_MAX_MS) return "txn_batch";
  return "agg";
}

/** Vertical bounds of the view/coordinate space. */
export const minY = 0;
export const maxY = 1;

export const ROW_HEIGHT_PX = 24;
export const BAR_HEIGHT_PX = 22;

/** Space above the rows for the track controls. */
export const TOP_INSET_PX = 24;

/**
 * Minimum px width a state counts as when mixing a column's color. Without it a
 * column's color is purely time-weighted, so states that are frequent but very
 * short (e.g. sigverify between long execute runs) vanish into their long
 * neighbors once zoomed out. Only affects color; opacity is always plain time
 * coverage (see createResolveMaterial), so this can't change brightness.
 */
export const MIN_STATE_WEIGHT_PX = 0.25;
export const OUTLINE_ALPHA = 0.5;
export const OUTLINE_BORDER_PX = 1.5;

export const OUTLINE_ERROR_RGB: RgbColor = convertToWebGlColor(
  transactionErrorOutlineColor,
);
export const OUTLINE_SUCCESS_RGB: RgbColor = convertToWebGlColor(
  transactionSuccessOutlineColor,
);

export type ActiveTileState = Exclude<TileState, TileState.Idle>;

export const tileStateColors: Record<ActiveTileState, string> = {
  [TileState.Sigverify]: "#B026FF",
  [TileState.Loading]: stateColors[TxnState.LOADING],
  [TileState.Validate]: stateColors[TxnState.VALIDATE],
  [TileState.Execute]: stateColors[TxnState.EXECUTE],
  [TileState.PostExecute]: stateColors[TxnState.POST_EXECUTE],
  [TileState.BlockedOnTiles]: "#C2703D",
  [TileState.BlockedOnConflicts]: "#B5575C",
  [TileState.BlockedOnNetwork]: "#C9B458",
  [TileState.SlotFinish]: "#6E9E78",
  [TileState.ExecBatch]: "#5F544D",
  [TileState.SigverifyBatch]: "#B026FF",
};

export const tileStateLabels: Record<ActiveTileState, string> = {
  [TileState.Sigverify]: "Sigverify",
  [TileState.Loading]: "Loading",
  [TileState.Validate]: "Validate",
  [TileState.Execute]: "Execute",
  [TileState.PostExecute]: "Post-Execute",
  [TileState.BlockedOnTiles]: "Blocked on tiles",
  [TileState.BlockedOnConflicts]: "Blocked on conflicts",
  [TileState.BlockedOnNetwork]: "Blocked on network",
  [TileState.SlotFinish]: "Slot finish",
  [TileState.ExecBatch]: "Exec batch",
  [TileState.SigverifyBatch]: "Sigverify batch",
};

export const replayStates: ActiveTileState[] = [
  TileState.BlockedOnTiles,
  TileState.BlockedOnConflicts,
  TileState.BlockedOnNetwork,
  TileState.SlotFinish,
];

export const execrpStates: Record<TileStatesGranularity, ActiveTileState[]> = {
  txn: [
    TileState.Sigverify,
    TileState.Loading,
    TileState.Validate,
    TileState.Execute,
    TileState.PostExecute,
  ],
  txn_batch: [TileState.SigverifyBatch, TileState.ExecBatch],
};

export interface TileStatesViewOpts {
  showOutlines: boolean;
}

export const DEFAULT_TILE_STATES_VIEW_OPTS: TileStatesViewOpts = {
  showOutlines: false,
};
