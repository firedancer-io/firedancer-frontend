import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import {
  replayTrackBackgroundColor,
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

/** Max gap between state lanes when the state labels are shown */
export const LANE_GAP_PX = 2;

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
  [TileState.LthashBatch]: replayExecrpLthashBatchColor,
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

const replayStates: TileState[] = [
  TileState.BlockedOnTiles,
  TileState.BlockedOnConflicts,
  TileState.BlockedOnNetwork,
  TileState.SlotFinish,
];

const execrpTxnStates: TileState[] = [
  TileState.Loading,
  TileState.Validate,
  TileState.Execute,
  TileState.PostExecute,
  TileState.Sigverify,
  TileState.Lthash,
];

const execrpBatchStates: TileState[] = [
  TileState.LoadBatch,
  TileState.ValidBatch,
  TileState.ExecBatch,
  TileState.PostExecBatch,
  TileState.SigverifyBatch,
  TileState.LthashBatch,
];

export const trackStates: Record<
  TileKind,
  Record<TileStatesGranularity | "agg", TileState[]>
> = {
  execrp: {
    txn: execrpTxnStates,
    txn_batch: execrpBatchStates,
    agg: execrpTxnStates,
  },
  replay: { txn: replayStates, txn_batch: replayStates, agg: replayStates },
};

export const coverageStates: Record<TileKind, TileState[]> = {
  execrp: [...execrpTxnStates, ...execrpBatchStates],
  replay: replayStates,
};

/**
 * Heatmap mixes each px's states into one color.
 * Stacked stacks the states bottom up by time.
 * Gantt separates states into individual lanes.
 */
export enum TileStatesMode {
  Heatmap = "heatmap",
  Stacked = "stacked",
  Gantt = "gantt",
}

export const tileStatesModeLabels: Record<TileStatesMode, string> = {
  [TileStatesMode.Heatmap]: "Heatmap",
  [TileStatesMode.Stacked]: "Stacked",
  [TileStatesMode.Gantt]: "Gantt",
};

export interface TileStatesModeOption {
  mode: TileStatesMode;
  maxMs?: number;
  minMs?: number;
  // shown when this mode isn't available at the visible range
  fallback?: TileStatesMode;
  separateLanes?: boolean;
}

export function getAvailableModes(
  options: TileStatesModeOption[],
  spanMs: number,
): TileStatesMode[] {
  return options
    .filter(
      ({ maxMs, minMs }) =>
        (maxMs === undefined || spanMs <= maxMs) &&
        (minMs === undefined || spanMs > minMs),
    )
    .map(({ mode }) => mode);
}

export function getDisplayMode(
  options: TileStatesModeOption[],
  selected: TileStatesMode,
  available: TileStatesMode[],
): TileStatesMode {
  if (available.includes(selected)) return selected;
  const fallback = options.find(({ mode }) => mode === selected)?.fallback;
  if (fallback && available.includes(fallback)) return fallback;
  return available[0] ?? selected;
}

export interface TileStatesViewOpts {
  mode: TileStatesMode;
  showErrorStates: boolean;
  separateLanes: boolean;
  idleWeight: number;
}

export const tileStatesModeOptions: Record<TileKind, TileStatesModeOption[]> = {
  execrp: [
    { mode: TileStatesMode.Heatmap },
    {
      mode: TileStatesMode.Stacked,
      minMs: 250,
      fallback: TileStatesMode.Gantt,
    },
    {
      mode: TileStatesMode.Gantt,
      maxMs: 250,
      fallback: TileStatesMode.Stacked,
    },
  ],
  replay: [
    {
      mode: TileStatesMode.Gantt,
      maxMs: 10_000,
      fallback: TileStatesMode.Stacked,
    },
    {
      mode: TileStatesMode.Stacked,
      minMs: 10_000,
      fallback: TileStatesMode.Gantt,
      separateLanes: true,
    },
  ],
};

export const DEFAULT_TILE_STATES_VIEW_OPTS: Record<
  TileKind,
  TileStatesViewOpts
> = {
  execrp: {
    mode: TileStatesMode.Heatmap,
    showErrorStates: false,
    separateLanes: false,
    idleWeight: 0.05,
  },
  replay: {
    mode: TileStatesMode.Gantt,
    showErrorStates: false,
    separateLanes: true,
    idleWeight: 1,
  },
};
