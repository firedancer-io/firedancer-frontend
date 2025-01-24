import { z } from "zod";

const summaryTopicSchema = z.object({
  topic: z.literal("summary"),
});

const epochTopicSchema = z.object({
  topic: z.literal("epoch"),
});

const peersTopicSchema = z.object({
  topic: z.literal("peers"),
});

const slotTopicSchema = z.object({
  topic: z.literal("slot"),
});

export const topicSchema = z.discriminatedUnion("topic", [
  summaryTopicSchema,
  epochTopicSchema,
  peersTopicSchema,
  slotTopicSchema,
]);

export const versionSchema = z.string();

export const clusterSchema = z.enum([
  "development",
  "mainnet-beta",
  "devnet",
  "testnet",
  "pythtest",
  "pythnet",
  "unknown",
]);

export const identityKeySchema = z.string();

export const uptimeNanosSchema = z.number();

export const tileTypeSchema = z.enum([
  "net",
  "quic",
  "verify",
  "dedup",
  "resolv",
  "pack",
  "bank",
  "poh",
  "shred",
  "store",
  "sign",
  "metric",
  "http",
  "plugin",
  "gui",
  "cswtch",
]);

export const tileSchema = z.object({
  kind: z.string(),
  kind_id: z.number(),
});

export const balanceSchema = z.number();

export const rootSlotSchema = z.number();

export const optimisticallyConfirmedSlotSchema = z.number();

export const completedSlotSchema = z.number();

export const estimatedSlotSchema = z.number();

export const estimatedSlotDurationSchema = z.number();

export const estimatedTpsSchema = z.object({
  total: z.number(),
  vote: z.number(),
  nonvote_success: z.number(),
  nonvote_failed: z.number(),
});

export const txnWaterfallInSchema = z.object({
  pack_retained: z.number(),
  resolv_retained: z.number(),
  quic: z.number(),
  udp: z.number(),
  gossip: z.number(),
});

export const txnWaterfallOutSchema = z.object({
  net_overrun: z.number(),
  quic_overrun: z.number(),
  quic_frag_drop: z.number(),
  quic_abandoned: z.number(),
  tpu_quic_invalid: z.number(),
  tpu_udp_invalid: z.number(),
  verify_overrun: z.number(),
  verify_parse: z.number(),
  verify_failed: z.number(),
  verify_duplicate: z.number(),
  dedup_duplicate: z.number(),
  resolv_lut_failed: z.number(),
  resolv_expired: z.number(),
  resolv_no_ledger: z.number(),
  resolv_ancient: z.number(),
  resolv_retained: z.number(),
  pack_invalid: z.number(),
  pack_retained: z.number(),
  pack_leader_slow: z.number(),
  pack_wait_full: z.number(),
  pack_expired: z.number(),
  bank_invalid: z.number(),
  block_success: z.number(),
  block_fail: z.number(),
});

export const txnWaterfallSchema = z.object({
  in: txnWaterfallInSchema,
  out: txnWaterfallOutSchema,
});

export const liveTxnWaterfallSchema = z.object({
  next_leader_slot: z.number().nullable(),
  waterfall: txnWaterfallSchema,
});

export const tilePrimaryMetricSchema = z.object({
  net_in: z.number(),
  quic: z.number(),
  verify: z.number(),
  dedup: z.number(),
  pack: z.number(),
  bank: z.number(),
  poh: z.number(),
  shred: z.number(),
  store: z.number(),
  net_out: z.number(),
});

export const liveTilePrimaryMetricSchema = z.object({
  next_leader_slot: z.number().nullable(),
  tile_primary_metric: tilePrimaryMetricSchema,
});

export const tileTimerSchema = z.object({
  tile: z.string(),
  kind_id: z.number(),
  idle: z.number(),
});

export const startupPhaseSchema = z.enum([
  "initializing",
  "searching_for_full_snapshot",
  "downloading_full_snapshot",
  "searching_for_incremental_snapshot",
  "downloading_incremental_snapshot",
  "cleaning_blockstore",
  "cleaning_accounts",
  "loading_ledger",
  "processing_ledger",
  "starting_services",
  "halted",
  "waiting_for_supermajority",
  "running",
]);

export const startupProgressSchema = z.object({
  phase: startupPhaseSchema,

  // downloading_full_snapshot
  downloading_full_snapshot_slot: z.number().nullable(),
  downloading_full_snapshot_peer: z.string().nullable(),
  downloading_full_snapshot_elapsed_secs: z.number().nullable(),
  downloading_full_snapshot_remaining_secs: z.number().nullable(),
  downloading_full_snapshot_throughput: z.number().nullable(),
  downloading_full_snapshot_total_bytes: z.number().nullable(),
  downloading_full_snapshot_current_bytes: z.number().nullable(),

  // downloading incremental snapshot
  downloading_incremental_snapshot_slot: z.number().nullable(),
  downloading_incremental_snapshot_peer: z.string().nullable(),
  downloading_incremental_snapshot_elapsed_secs: z.number().nullable(),
  downloading_incremental_snapshot_remaining_secs: z.number().nullable(),
  downloading_incremental_snapshot_throughput: z.number().nullable(),
  downloading_incremental_snapshot_total_bytes: z.number().nullable(),
  downloading_incremental_snapshot_current_bytes: z.number().nullable(),

  // processing ledger
  ledger_slot: z.number().nullable(),
  ledger_max_slot: z.number().nullable(),

  // waiting for supermajority
  waiting_for_supermajority_slot: z.number().nullable(),
  waiting_for_supermajority_stake_percent: z.number().nullable(),
});

export const slotLevelSchema = z.enum([
  "incomplete",
  "completed",
  "optimistically_confirmed",
  "rooted",
  "finalized",
]);

export const slotPublishSchema = z.object({
  slot: z.number(),
  mine: z.boolean(),
  skipped: z.boolean(),
  level: slotLevelSchema,
  transactions: z.number().nullable(),
  vote_transactions: z.number().nullable(),
  failed_transactions: z.number().nullable(),
  priority_fee: z.number().nullable(),
  transaction_fee: z.number().nullable(),
  tips: z.number().nullable(),
  compute_units: z.number().nullable(),
  duration_nanos: z.number().nullable(),
  completed_time_nanos: z.number().nullable(),
});

export const tpsHistorySchema = z.array(
  z.tuple([
    z.number(), // total
    z.number(), // vote
    z.number(), // nonvote_success
    z.number(), // nonvote_failed
  ])
);

export const voteStateSchema = z.enum(["voting", "non-voting", "delinquent"]);

export const voteDistanceSchema = z.number();

export const skipRateSchema = z.object({
  epoch: z.number(),
  skip_rate: z.number(),
  // slots_processed: z.number(),
  // slots_skipped: z.number(),
});

export const firstProcessedSlotSchema = z.object({
  epoch: z.number(),
  slot: z.number().nullable(),
});

export const summarySchema = z.discriminatedUnion("key", [
  summaryTopicSchema.extend({
    key: z.literal("ping"),
    value: z.null(),
    id: z.number(),
  }),
  summaryTopicSchema.extend({
    key: z.literal("version"),
    value: versionSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("cluster"),
    value: clusterSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("identity_key"),
    value: identityKeySchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("uptime_nanos"),
    value: uptimeNanosSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("tiles"),
    value: tileSchema.array(),
  }),
  summaryTopicSchema.extend({
    key: z.literal("balance"),
    value: balanceSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("root_slot"),
    value: rootSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("optimistically_confirmed_slot"),
    value: optimisticallyConfirmedSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("completed_slot"),
    value: completedSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("estimated_slot"),
    value: estimatedSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("estimated_slot_duration_nanos"),
    value: estimatedSlotDurationSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("estimated_tps"),
    value: estimatedTpsSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("live_txn_waterfall"),
    value: liveTxnWaterfallSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("live_tile_primary_metric"),
    value: liveTilePrimaryMetricSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("live_tile_timers"),
    value: z.number().array(),
  }),
  summaryTopicSchema.extend({
    key: z.literal("startup_progress"),
    value: startupProgressSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("tps_history"),
    value: tpsHistorySchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("vote_state"),
    value: voteStateSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("vote_distance"),
    value: voteDistanceSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("skip_rate"),
    value: skipRateSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("first_processed_slot"),
    value: firstProcessedSlotSchema,
  }),
]);

export const epochNewSchema = z.object({
  epoch: z.number(),
  start_slot: z.number(),
  end_slot: z.number(),
  excluded_stake_lamports: z.number(),
  staked_pubkeys: z.string().array(),
  staked_lamports: z.number().array(),
  leader_slots: z.number().array(),
});

export const epochSchema = z.discriminatedUnion("key", [
  epochTopicSchema.extend({
    key: z.literal("new"),
    value: epochNewSchema,
  }),
]);

const peerUpdateGossipSchema = z.object({
  wallclock: z.number(),
  shred_version: z.number(),
  version: z.string().nullable(),
  feature_set: z.number().nullable(),
  sockets: z.record(z.string(), z.string()),
});

const peerUpdateVoteAccountSchema = z.object({
  vote_account: z.string(),
  activated_stake: z.number(),
  last_vote: z.nullable(z.number()),
  root_slot: z.nullable(z.number()),
  epoch_credits: z.number(),
  commission: z.number(),
  delinquent: z.boolean(),
});

const peerUpdateInfoSchema = z.object({
  name: z.nullable(z.string()),
  details: z.nullable(z.string()),
  website: z.nullable(z.string()),
  icon_url: z.nullable(z.string()),
});

export const peerUpdateSchema = z.object({
  identity_pubkey: z.string(),
  gossip: z.nullable(peerUpdateGossipSchema),
  vote: z.array(peerUpdateVoteAccountSchema),
  info: z.nullable(peerUpdateInfoSchema),
});

export const peerRemoveSchema = z.object({
  identity_pubkey: z.string(),
});

const peersUpdateSchema = z.object({
  add: z.array(peerUpdateSchema).optional(),
  update: z.array(peerUpdateSchema).optional(),
  remove: z.array(peerRemoveSchema).optional(),
});

export const peersSchema = z.discriminatedUnion("key", [
  peersTopicSchema.extend({
    key: z.literal("update"),
    value: peersUpdateSchema,
  }),
]);

const tsTileTimersSchema = z.object({
  timestamp_nanos: z.number(),
  tile_timers: z.number().array(),
});

export const slotResponseSchema = z.object({
  publish: slotPublishSchema,
  waterfall: txnWaterfallSchema.nullable(),
  tile_primary_metric: tilePrimaryMetricSchema.nullable(),
  tile_timers: tsTileTimersSchema.array().nullable().optional(),
});

export const slotSkippedHistorySchema = z.number().array();

export const slotSchema = z.discriminatedUnion("key", [
  slotTopicSchema.extend({
    key: z.literal("skipped_history"),
    value: slotSkippedHistorySchema,
  }),
  slotTopicSchema.extend({
    key: z.literal("update"),
    value: slotResponseSchema,
  }),
  slotTopicSchema.extend({
    key: z.literal("query"),
    value: slotResponseSchema.nullable(),
  }),
]);
