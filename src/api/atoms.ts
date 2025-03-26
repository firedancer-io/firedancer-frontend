import { atom } from "jotai";
import {
  Version,
  Cluster,
  CommitHash,
  IdentityKey,
  RootSlot,
  OptimisticallyConfirmedSlot,
  CompletedSlot,
  EstimatedSlot,
  EstimatedTps,
  EstimatedSlotDuration,
  IdentityBalance,
  UptimeNanos,
  LiveTxnWaterfall,
  StartupProgress,
  LiveTilePrimaryMetric,
  SkippedSlots,
  Tile,
  TpsHistory,
  VoteState,
  VoteDistance,
  BlockEngineUpdate,
  VoteBalance,
} from "./types";
import { DateTime } from "luxon";
import { rafAtom } from "../atomUtils";

export const versionAtom = atom<Version | undefined>(undefined);

export const clusterAtom = atom<Cluster | undefined>(undefined);

export const commitHashAtom = atom<CommitHash | undefined>(undefined);

export const identityKeyAtom = atom<IdentityKey | undefined>(undefined);

export const uptimeAtom = atom<
  { uptimeNanos: UptimeNanos; ts: DateTime } | undefined
>(undefined);

export const tilesAtom = atom<Tile[] | undefined>(undefined);

export const identityBalanceAtom = atom<IdentityBalance | undefined>(undefined);

export const voteBalanceAtom = atom<VoteBalance | undefined>(undefined);

export const rootSlotAtom = atom<RootSlot | undefined>(undefined);

export const optimisticallyConfirmedSlotAtom = atom<
  OptimisticallyConfirmedSlot | undefined
>(undefined);

export const completedSlotAtom = atom<CompletedSlot | undefined>(undefined);

export const estimatedSlotAtom = atom<EstimatedSlot | undefined>(undefined);

export const estimatedSlotDurationAtom = atom<
  EstimatedSlotDuration | undefined
>(undefined);

export const estimatedTpsAtom = atom<EstimatedTps | undefined>(undefined);

export const liveTxnWaterfallAtom = rafAtom<LiveTxnWaterfall | undefined>(
  undefined,
);

export const liveTilePrimaryMetricAtom = atom<
  LiveTilePrimaryMetric | undefined
>(undefined);

export const tileTimerAtom = atom<number[] | undefined>(undefined);

export const startupProgressAtom = atom<StartupProgress | undefined>(undefined);

export const tpsHistoryAtom = atom<TpsHistory | undefined>(undefined);

export const voteStateAtom = atom<VoteState | undefined>(undefined);

export const voteDistanceAtom = atom<VoteDistance | undefined>(undefined);

export const skippedSlotsAtom = atom<SkippedSlots | undefined>(undefined);

export const blockEngineAtom = atom<BlockEngineUpdate | undefined>(undefined);
