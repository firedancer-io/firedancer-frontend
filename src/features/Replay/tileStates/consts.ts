import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { Tile, TileStatesGranularity } from "../../../api/types.ts";
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

export const tileKinds: TileKind[] = ["execrp", "replay"];

const replayStates = [
  TileState.BlockedOnTiles,
  TileState.BlockedOnConflicts,
  TileState.BlockedOnNetwork,
  TileState.SlotFinish,
];

/** Each track's states drawn per granularity, in texel row order */
export const trackStates: Record<
  TileKind,
  Record<TileStatesGranularity, TileState[]>
> = {
  execrp: {
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
  },
  replay: { txn: replayStates, txn_batch: replayStates },
};

interface TileRow {
  tileIdx: number;
  label: string;
}

export function getTileRows(
  tiles: Tile[] | undefined,
  trackKind: TileKind,
): TileRow[] {
  const rows: TileRow[] = [];
  tiles?.forEach(({ kind, kind_id }, tileIdx) => {
    if (kind === trackKind) rows.push({ tileIdx, label: `${kind_id}` });
  });
  return rows;
}

export const tileStatesTileNs: Record<TileStatesGranularity, bigint> = {
  txn: 3_000_000_000n, // 3s
  txn_batch: 30_000_000_000n, // 30s
};

const TXN_MAX_MS = 20_000; // 20s
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

// A merge level's bin is at most this fraction of a device px
export const MERGE_BIN_PX = 1 / 16;

// Ascending, 4x apart. 0 keeps every state as is.
export const mergeBinsMs: Record<TileStatesGranularity, number[]> = {
  txn: [0, 2 ** -9, 2 ** -7, 2 ** -5, 2 ** -3, 2 ** -1],
  txn_batch: [0, 2 ** -4, 2 ** -2, 1, 4],
};

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
