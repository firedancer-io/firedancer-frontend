import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import {
  replayBlockedOnConflictsColor,
  replayBlockedOnNetworkColor,
  replayBlockedOnTilesColor,
  replaySlotFinishColor,
  replayTrackBackgroundColor,
  transactionErrorOutlineColor,
  transactionExecuteColor,
  transactionLoadingColor,
  transactionPostExecuteColor,
  transactionSigverifyColor,
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

/**
 * Default weight of idle time relative to busy states, in the heatmap color and
 * stacked bar heights. 1 counts idle like any state and 0 ignores it to show
 * only the busy mix.
 */
export const IDLE_WEIGHT = 0.05;

/** Default bar height, for tracks without lane labels */
export const BAR_HEIGHT_PX = 22;
/** Space above each row's bar */
export const BAR_GAP_PX = 2;
/** Height of each state's lane when the state labels are shown */
export const LANE_HEIGHT_PX = 17;
/** Space between lanes when the state labels are shown */
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
  [TileState.Sigverify]: transactionSigverifyColor,
  [TileState.Loading]: transactionLoadingColor,
  [TileState.Validate]: transactionValidateColor,
  [TileState.Execute]: transactionExecuteColor,
  [TileState.PostExecute]: transactionPostExecuteColor,
  [TileState.BlockedOnTiles]: replayBlockedOnTilesColor,
  [TileState.BlockedOnConflicts]: replayBlockedOnConflictsColor,
  [TileState.BlockedOnNetwork]: replayBlockedOnNetworkColor,
  [TileState.SlotFinish]: replaySlotFinishColor,
  [TileState.ExecBatch]: transactionExecuteColor,
  [TileState.SigverifyBatch]: transactionSigverifyColor,
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
  [TileState.ExecBatch]: "Exec batch",
  [TileState.SigverifyBatch]: "Sigverify batch",
};

const replayStates: TileState[] = [
  TileState.BlockedOnTiles,
  TileState.BlockedOnConflicts,
  TileState.BlockedOnNetwork,
  TileState.SlotFinish,
];

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
    ],
    txn_batch: [TileState.ExecBatch, TileState.SigverifyBatch],
  },
  replay: { txn: replayStates, txn_batch: replayStates },
};

/**
 * States written to the coverage render targets, one channel each and 4 per
 * target. Must include every state in the track's trackStates. Idle isn't
 * drawn, since time without a busy state is idle.
 */
export const coverageStates: Record<TileKind, TileState[]> = {
  execrp: [
    TileState.Loading,
    TileState.Validate,
    TileState.Execute,
    TileState.PostExecute,
    TileState.Sigverify,
    TileState.ExecBatch,
    TileState.SigverifyBatch,
  ],
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
  /**
   * Stacked only: whether each state's bar starts in its own lane instead of
   * stacked. Setting it either way adds a toggle for it to the controls.
   */
  separateLanes?: boolean;
}

export const DEFAULT_TILE_STATES_MODE_OPTIONS: TileStatesModeOption[] = (
  Object.keys(tileStatesModeLabels) as TileStatesMode[]
).map((mode) => ({ mode }));

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
  spanMs: number,
): TileStatesMode {
  const available = getAvailableModes(options, spanMs);
  if (available.includes(selected)) return selected;
  const fallback = options.find(({ mode }) => mode === selected)?.fallback;
  if (fallback && available.includes(fallback)) return fallback;
  return available[0] ?? selected;
}

export interface TileStatesViewOpts {
  /** Stacked only: each state's bar in its own lane */
  separateLanes: boolean;
  showErrorStates: boolean;
  mode: TileStatesMode;
  idleWeight: number;
}

export function getDefaultViewOpts(
  mode: TileStatesMode,
  separateLanes: boolean,
  idleWeight: number,
): TileStatesViewOpts {
  return {
    showErrorStates: false,
    mode,
    separateLanes,
    idleWeight,
  };
}
