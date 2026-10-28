import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import {
  transactionErrorOutlineColor,
  transactionExecuteSolidColor,
  transactionLoadingSolidColor,
  transactionPostExecuteSolidColor,
  transactionSuccessOutlineColor,
  transactionValidateColor,
} from "../../../colors.ts";

export type TileKind = "execrp" | "replay";

export const TXN_MAX_MS = 30_000; // 30s
export const BATCH_MAX_MS = 30 * 60_000; // 30min

export function getTileStatesGranularity(
  spanMs: number,
): TileStatesGranularity {
  return spanMs < TXN_MAX_MS
    ? TileStatesGranularityEnum.txn
    : TileStatesGranularityEnum.txn_batch;
}

export function isAggregate(rangeMs: TsRange) {
  return rangeMs[1] - rangeMs[0] >= BATCH_MAX_MS;
}

export const ROW_HEIGHT_PX = 24;
export const BAR_HEIGHT_PX = 22;

export const ERROR_STATES_ALPHA = 0.5;
export const ERROR_STATES_BORDER_PX = 1.5;

export enum ErrorState {
  Failed = 0,
  Succeeded = 1,
}

export const errorStateColors: Record<ErrorState, string> = {
  [ErrorState.Failed]: transactionErrorOutlineColor,
  [ErrorState.Succeeded]: transactionSuccessOutlineColor,
};

export const tileStateColors: Record<TileState, string> = {
  [TileState.Idle]: "#000000",
  [TileState.Sigverify]: "#B026FF",
  [TileState.Loading]: transactionLoadingSolidColor,
  [TileState.Validate]: transactionValidateColor,
  [TileState.Execute]: transactionExecuteSolidColor,
  [TileState.PostExecute]: transactionPostExecuteSolidColor,
  [TileState.BlockedOnTiles]: "#B2A65A",
  [TileState.BlockedOnConflicts]: "#B0604A",
  [TileState.BlockedOnNetwork]: "#4F6F95",
  [TileState.SlotFinish]: "#4E8C77",
  [TileState.ExecBatch]: "#5F544D",
  [TileState.SigverifyBatch]: "#B026FF",
};

export const tileStateLabels: Record<TileState, string> = {
  [TileState.Idle]: "Idle",
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

export const replayStates: TileState[] = [
  TileState.BlockedOnTiles,
  TileState.BlockedOnConflicts,
  TileState.BlockedOnNetwork,
  TileState.SlotFinish,
];

export const execrpStates: Record<TileStatesGranularity, TileState[]> = {
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
  showErrorStates: boolean;
}

export const DEFAULT_TILE_STATES_VIEW_OPTS: TileStatesViewOpts = {
  showErrorStates: false,
};
