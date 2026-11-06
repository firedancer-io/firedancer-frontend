import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import {
  transactionErrorOutlineColor,
  transactionSuccessOutlineColor,
  replayBlockedOnConflictsColor,
  replayBlockedOnNetworkColor,
  replayBlockedOnTilesColor,
  replayExecrpExecuteColor,
  replayExecrpLoadingColor,
  replayExecrpLthashBatchColor,
  replayExecrpLthashColor,
  replayExecrpPostExecuteColor,
  replayExecrpSigverifyColor,
  replayExecrpValidateColor,
  replaySlotFinishColor,
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

export const BAR_HEIGHT_RATIO = 22 / 24;

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
  [TileState.Sigverify]: replayExecrpSigverifyColor,
  [TileState.Loading]: replayExecrpLoadingColor,
  [TileState.Validate]: replayExecrpValidateColor,
  [TileState.Execute]: replayExecrpExecuteColor,
  [TileState.PostExecute]: replayExecrpPostExecuteColor,
  [TileState.BlockedOnTiles]: replayBlockedOnTilesColor,
  [TileState.BlockedOnConflicts]: replayBlockedOnConflictsColor,
  [TileState.BlockedOnNetwork]: replayBlockedOnNetworkColor,
  [TileState.SlotFinish]: replaySlotFinishColor,
  [TileState.Lthash]: replayExecrpLthashColor,
  [TileState.SigverifyBatch]: replayExecrpSigverifyColor,
  [TileState.LoadBatch]: replayExecrpLoadingColor,
  [TileState.ValidBatch]: replayExecrpValidateColor,
  [TileState.ExecBatch]: replayExecrpExecuteColor,
  [TileState.PostExecBatch]: replayExecrpPostExecuteColor,
  [TileState.LthashBatch]: replayExecrpLthashBatchColor,
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
  [TileState.Lthash]: "LtHash",
  [TileState.SigverifyBatch]: "Sigverify batch",
  [TileState.LoadBatch]: "Load batch",
  [TileState.ValidBatch]: "Validate batch",
  [TileState.ExecBatch]: "Execute batch",
  [TileState.PostExecBatch]: "Post-Execute batch",
  [TileState.LthashBatch]: "LtHash batch",
};

export const replayStates: TileState[] = [
  TileState.BlockedOnTiles,
  TileState.BlockedOnConflicts,
  TileState.BlockedOnNetwork,
  TileState.SlotFinish,
];

export const execrpStates: Record<TileStatesGranularity, TileState[]> = {
  txn: [
    TileState.Loading,
    TileState.Validate,
    TileState.Execute,
    TileState.PostExecute,
    TileState.Sigverify,
    TileState.Lthash,
  ],
  txn_batch: [
    TileState.LoadBatch,
    TileState.ValidBatch,
    TileState.ExecBatch,
    TileState.PostExecBatch,
    TileState.SigverifyBatch,
    TileState.LthashBatch,
  ],
};

export interface TileStatesViewOpts {
  showErrorStates: boolean;
}

export const DEFAULT_TILE_STATES_VIEW_OPTS: TileStatesViewOpts = {
  showErrorStates: false,
};
