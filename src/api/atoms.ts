import { atom } from "jotai";
import type {
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
  StartupTimeNanos,
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
  ScheduleStrategy,
  SlotRankings,
  BootProgress,
  GossipNetworkStats,
  GossipNetworkHealth,
  GossipPeersSize,
  GossipPeersRowsUpdate,
  GossipPeersCellUpdate,
  ServerTimeNanos,
  LiveNetworkMetrics,
  TileMetrics,
  TurbineSlot,
  VoteSlot,
  StorageSlot,
  ResetSlot,
  RepairSlot,
} from "./types";
import { rafAtom } from "../atomUtils";
import type { ValuesWithHistory } from "./worker/types";

const emptyValuesWithHistory: ValuesWithHistory = { values: [], history: [] };

export const versionAtom = atom<Version | undefined>(undefined);

export const clusterAtom = atom<Cluster | undefined>(undefined);

export const commitHashAtom = atom<CommitHash | undefined>(undefined);

export const identityKeyAtom = atom<IdentityKey | undefined>(undefined);

export const startupTimeAtom = atom<
  { startupTimeNanos: StartupTimeNanos } | undefined
>(undefined);

export const tilesAtom = atom<Tile[] | undefined>(undefined);

export const scheduleStrategyAtom = atom<ScheduleStrategy | undefined>(
  undefined,
);

export const identityBalanceAtom = atom<IdentityBalance | undefined>(undefined);

export const voteBalanceAtom = atom<VoteBalance | undefined>(undefined);

export const rootSlotAtom = atom<RootSlot | undefined>(undefined);

export const optimisticallyConfirmedSlotAtom = atom<
  OptimisticallyConfirmedSlot | undefined
>(undefined);

export const completedSlotAtom = atom<CompletedSlot | undefined>(undefined);
export const serverTimeNanosAtom = atom<ServerTimeNanos | undefined>(undefined);

export const estimatedSlotAtom = atom<EstimatedSlot | undefined>(undefined);

export const resetSlotAtom = atom<ResetSlot | undefined>(undefined);

export const storageSlotAtom = atom<StorageSlot | undefined>(undefined);

export const voteSlotAtom = atom<VoteSlot | undefined>(undefined);

export const repairSlotAtom = atom<RepairSlot | undefined>(undefined);

export const turbineSlotAtom = atom<TurbineSlot | undefined>(undefined);

export const estimatedSlotDurationAtom = atom<
  EstimatedSlotDuration | undefined
>(undefined);

export const estimatedTpsAtom = atom<EstimatedTps | undefined>(undefined);

export const liveNetworkMetricsAtom = atom<LiveNetworkMetrics | undefined>(
  undefined,
);

export const networkMetricsEmaIngressAtom = atom<ValuesWithHistory>(
  emptyValuesWithHistory,
);

export const networkMetricsEmaEgressAtom = atom<ValuesWithHistory>(
  emptyValuesWithHistory,
);

export const liveTxnWaterfallAtom = rafAtom<LiveTxnWaterfall | undefined>(
  undefined,
);

export const liveTilePrimaryMetricAtom = atom<
  LiveTilePrimaryMetric | undefined
>(undefined);

export const liveTileMetricsAtom = atom<TileMetrics | undefined>(undefined);

export const tileTimerAtom = atom<number[] | undefined>(undefined);

export const tileTimerHistoryAtom = atom<ValuesWithHistory>(
  emptyValuesWithHistory,
);

export const bootProgressAtom = atom<BootProgress | undefined>(undefined);
export const startupProgressAtom = atom<StartupProgress | undefined>(undefined);

export const gossipNetworkStatsAtom = rafAtom<GossipNetworkStats | undefined>(
  undefined,
);

export type GossipHealthEma = Pick<
  GossipNetworkHealth,
  | "num_push_messages_rx_success"
  | "num_push_messages_rx_failure"
  | "num_push_entries_rx_success"
  | "num_push_entries_rx_failure"
  | "num_push_entries_rx_duplicate"
  | "num_pull_response_messages_rx_success"
  | "num_pull_response_messages_rx_failure"
  | "num_pull_response_entries_rx_success"
  | "num_pull_response_entries_rx_failure"
  | "num_pull_response_entries_rx_duplicate"
>;

const emptyGossipHealthEmaValue: GossipHealthEma = {
  num_push_messages_rx_success: 0,
  num_push_messages_rx_failure: 0,
  num_push_entries_rx_success: 0,
  num_push_entries_rx_failure: 0,
  num_push_entries_rx_duplicate: 0,
  num_pull_response_messages_rx_success: 0,
  num_pull_response_messages_rx_failure: 0,
  num_pull_response_entries_rx_success: 0,
  num_pull_response_entries_rx_failure: 0,
  num_pull_response_entries_rx_duplicate: 0,
};

export type GossipHealthEmaState = {
  value: GossipHealthEma;
  history: { ts: number; value: GossipHealthEma }[];
};

export const gossipHealthEmaAtom = atom<GossipHealthEmaState>({
  value: emptyGossipHealthEmaValue,
  history: [],
});

export const gossipPeersSizeAtom = atom<GossipPeersSize | undefined>(undefined);
export const gossipPeersRowsUpdateAtom = atom<
  GossipPeersRowsUpdate | undefined
>(undefined);
export const gossipPeersCellUpdateAtom = atom<
  GossipPeersCellUpdate | undefined
>(undefined);

export const tpsHistoryAtom = atom<TpsHistory | undefined>(undefined);

export const voteStateAtom = atom<VoteState | undefined>(undefined);

export const voteDistanceAtom = atom<VoteDistance | undefined>(undefined);

export const skippedSlotsAtom = atom<SkippedSlots | undefined>(undefined);

export const blockEngineAtom = atom<BlockEngineUpdate | undefined>(undefined);

export const slotRankingsAtom = atom<SlotRankings | undefined>(undefined);
