import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import type { LegendItem } from "../TrackControls.tsx";
import {
  replayBlockedOnConflictsColor,
  replayBlockedOnNetworkColor,
  replayBlockedOnTilesColor,
  replayExecrpExecuteColor,
  replayExecrpLoadingColor,
  replayExecrpLthashColor,
  replayExecrpPostExecuteColor,
  replayExecrpSigverifyColor,
  replayExecrpValidateColor,
  replaySlotFinishColor,
  replayTrackBackgroundColor,
  transactionErrorOutlineColor,
  transactionSuccessOutlineColor,
} from "../../../colors.ts";

export type TileKind = "execrp" | "replay";

const TXN_MAX_MS = 4_000; // 4s
const BATCH_MAX_MS = 4 * 60_000; // 4min

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
  [TileState.Idle]: replayTrackBackgroundColor,
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
  [TileState.LthashBatch]: replayExecrpLthashColor,
};

export const tileStateLabels: Record<TileState, string> = {
  [TileState.Idle]: "Idle",
  [TileState.Sigverify]: "Sigverify",
  [TileState.Loading]: "Loading",
  [TileState.Validate]: "Validate",
  [TileState.Execute]: "Execute",
  [TileState.PostExecute]: "Post-Execute",
  [TileState.BlockedOnTiles]: "Tiles",
  [TileState.BlockedOnConflicts]: "Conflicts",
  [TileState.BlockedOnNetwork]: "Network",
  [TileState.SlotFinish]: "Finish",
  [TileState.Lthash]: "LtHash",
  [TileState.SigverifyBatch]: "Sigverify batch",
  [TileState.LoadBatch]: "Load batch",
  [TileState.ValidBatch]: "Validate batch",
  [TileState.ExecBatch]: "Execute batch",
  [TileState.PostExecBatch]: "Post-Execute batch",
  [TileState.LthashBatch]: "LtHash batch",
};

export function toLegendItem(state: TileState): LegendItem {
  return { label: tileStateLabels[state], color: tileStateColors[state] };
}
