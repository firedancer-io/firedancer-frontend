import type { z } from "zod";
import type {
  clientSchema,
  identityBalanceSchema,
  blockEngineStatusSchema,
  blockEngineUpdateSchema,
  clusterSchema,
  completedSlotSchema,
  epochNewSchema,
  estimatedSlotDurationSchema,
  estimatedSlotSchema,
  estimatedTpsSchema,
  commitHashSchema,
  identityKeySchema,
  liveTilePrimaryMetricSchema,
  liveTxnWaterfallSchema,
  optimisticallyConfirmedSlotSchema,
  peerRemoveSchema,
  peerUpdateSchema,
  rootSlotSchema,
  skipRateSchema,
  slotLevelSchema,
  slotPublishSchema,
  slotResponseSchema,
  slotSkippedHistorySchema,
  startupPhaseSchema,
  startupProgressSchema,
  tilePrimaryMetricSchema,
  tileSchema,
  tileTimerSchema,
  tileTypeSchema,
  tpsHistorySchema,
  txnWaterfallInSchema,
  txnWaterfallOutSchema,
  txnWaterfallSchema,
  startupTimeNanosSchema,
  versionSchema,
  voteDistanceSchema,
  voteStateSchema,
  slotTransactionsSchema,
  voteBalanceSchema,
  scheduleStrategySchema,
  bootPhaseSchema,
  bootProgressSchema,
  gossipNetworkStatsSchema,
} from "./entities";

export type Client = z.infer<typeof clientSchema>;

export type Version = z.infer<typeof versionSchema>;

export type Cluster = z.infer<typeof clusterSchema>;

export type CommitHash = z.infer<typeof commitHashSchema>;

export type IdentityKey = z.infer<typeof identityKeySchema>;

export type StartupTimeNanos = z.infer<typeof startupTimeNanosSchema>;

export type Tile = z.infer<typeof tileSchema>;

export type ScheduleStrategy = z.infer<typeof scheduleStrategySchema>;

export type IdentityBalance = z.infer<typeof identityBalanceSchema>;

export type VoteBalance = z.infer<typeof voteBalanceSchema>;

export type RootSlot = z.infer<typeof rootSlotSchema>;

// export type SlotRooted = z.infer<typeof slotRootedSchema>;

export type OptimisticallyConfirmedSlot = z.infer<
  typeof optimisticallyConfirmedSlotSchema
>;

// export type SlotOptimisticallyConfirmed = z.infer<
//   typeof slotOptimisticallyConfirmedSchema
// >;

export type CompletedSlot = z.infer<typeof completedSlotSchema>;

// export type SlotCompleted = z.infer<typeof slotCompletedSchema>;

export type EstimatedSlot = z.infer<typeof estimatedSlotSchema>;

export type EstimatedSlotDuration = z.infer<typeof estimatedSlotDurationSchema>;

export type EstimatedTps = z.infer<typeof estimatedTpsSchema>;

export type LiveTxnWaterfall = z.infer<typeof liveTxnWaterfallSchema>;

export type LiveTilePrimaryMetric = z.infer<typeof liveTilePrimaryMetricSchema>;

export type TilePrimaryMetric = z.infer<typeof tilePrimaryMetricSchema>;

export type TxnWaterfallIn = z.infer<typeof txnWaterfallInSchema>;
export type TxnWaterfallOut = z.infer<typeof txnWaterfallOutSchema>;
export type TxnWaterfall = z.infer<typeof txnWaterfallSchema>;

export type TileType = z.infer<typeof tileTypeSchema>;

export type TileTimer = z.infer<typeof tileTimerSchema>;

export type BootProgress = z.infer<typeof bootProgressSchema>;

export type StartupProgress = z.infer<typeof startupProgressSchema>;

export type StartupPhase = z.infer<typeof startupPhaseSchema>;

export type BootPhase = z.infer<typeof bootPhaseSchema>;

export type TpsHistory = z.infer<typeof tpsHistorySchema>;

export type VoteState = z.infer<typeof voteStateSchema>;

export type VoteDistance = z.infer<typeof voteDistanceSchema>;

export type SkipRate = z.infer<typeof skipRateSchema>;

export type Epoch = z.infer<typeof epochNewSchema>;

export type SlotLevel = z.infer<typeof slotLevelSchema>;

export type GossipNetworkStats = z.infer<typeof gossipNetworkStatsSchema>;

export interface Peer extends z.infer<typeof peerUpdateSchema> {
  removed?: boolean;
}

export type PeerRemove = z.infer<typeof peerRemoveSchema>;

export type SlotTransactions = z.infer<typeof slotTransactionsSchema>;

export type SlotPublish = z.infer<typeof slotPublishSchema>;

export type SlotResponse = z.infer<typeof slotResponseSchema>;

export type SkippedSlots = z.infer<typeof slotSkippedHistorySchema>;

export type BlockEngineUpdate = z.infer<typeof blockEngineUpdateSchema>;

export type BlockEngineStatus = z.infer<typeof blockEngineStatusSchema>;
