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

const blockEngineTopicSchema = z.object({
  topic: z.literal("block_engine"),
});

export const topicSchema = z.discriminatedUnion("topic", [
  summaryTopicSchema,
  epochTopicSchema,
  peersTopicSchema,
  slotTopicSchema,
  blockEngineTopicSchema,
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

export const commitHashSchema = z.string();

export const identityKeySchema = z.string();

export const uptimeNanosSchema = z.coerce.number();

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
  kind_id: z.coerce.number(),
});

export const identityBalanceSchema = z.coerce.number();

export const rootSlotSchema = z.coerce.number();

export const optimisticallyConfirmedSlotSchema = z.coerce.number();

export const completedSlotSchema = z.coerce.number();

export const estimatedSlotSchema = z.coerce.number();

export const estimatedSlotDurationSchema = z.coerce.number();

export const estimatedTpsSchema = z.object({
  total: z.coerce.number(),
  vote: z.coerce.number(),
  nonvote_success: z.coerce.number(),
  nonvote_failed: z.coerce.number(),
});

export const txnWaterfallInSchema = z.object({
  pack_cranked: z.coerce.number(),
  pack_retained: z.coerce.number(),
  resolv_retained: z.coerce.number(),
  quic: z.coerce.number(),
  udp: z.coerce.number(),
  gossip: z.coerce.number(),
  block_engine: z.coerce.number(),
});

export const txnWaterfallOutSchema = z.object({
  net_overrun: z.coerce.number(),
  quic_overrun: z.coerce.number(),
  quic_frag_drop: z.coerce.number(),
  quic_abandoned: z.coerce.number(),
  tpu_quic_invalid: z.coerce.number(),
  tpu_udp_invalid: z.coerce.number(),
  verify_overrun: z.coerce.number(),
  verify_parse: z.coerce.number(),
  verify_failed: z.coerce.number(),
  verify_duplicate: z.coerce.number(),
  dedup_duplicate: z.coerce.number(),
  resolv_lut_failed: z.coerce.number(),
  resolv_expired: z.coerce.number(),
  resolv_no_ledger: z.coerce.number(),
  resolv_ancient: z.coerce.number(),
  resolv_retained: z.coerce.number(),
  pack_invalid: z.coerce.number(),
  pack_retained: z.coerce.number(),
  pack_leader_slow: z.coerce.number(),
  pack_wait_full: z.coerce.number(),
  pack_expired: z.coerce.number(),
  bank_invalid: z.coerce.number(),
  block_success: z.coerce.number(),
  block_fail: z.coerce.number(),
});

export const txnWaterfallSchema = z.object({
  in: txnWaterfallInSchema,
  out: txnWaterfallOutSchema,
});

export const liveTxnWaterfallSchema = z.object({
  next_leader_slot: z.coerce.number().nullable(),
  waterfall: txnWaterfallSchema,
});

export const tilePrimaryMetricSchema = z.object({
  net_in: z.coerce.number(),
  quic: z.coerce.number(),
  verify: z.coerce.number(),
  dedup: z.coerce.number(),
  pack: z.coerce.number(),
  bank: z.coerce.number(),
  poh: z.coerce.number(),
  shred: z.coerce.number(),
  store: z.coerce.number(),
  net_out: z.coerce.number(),
});

export const liveTilePrimaryMetricSchema = z.object({
  next_leader_slot: z.coerce.number().nullable(),
  tile_primary_metric: tilePrimaryMetricSchema,
});

export const tileTimerSchema = z.object({
  tile: z.string(),
  kind_id: z.coerce.number(),
  idle: z.coerce.number(),
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
  downloading_full_snapshot_slot: z.coerce.number().nullable(),
  downloading_full_snapshot_peer: z.string().nullable(),
  downloading_full_snapshot_elapsed_secs: z.coerce.number().nullable(),
  downloading_full_snapshot_remaining_secs: z.coerce.number().nullable(),
  downloading_full_snapshot_throughput: z.coerce.number().nullable(),
  downloading_full_snapshot_total_bytes: z.coerce.number().nullable(),
  downloading_full_snapshot_current_bytes: z.coerce.number().nullable(),

  // downloading incremental snapshot
  downloading_incremental_snapshot_slot: z.coerce.number().nullable(),
  downloading_incremental_snapshot_peer: z.string().nullable(),
  downloading_incremental_snapshot_elapsed_secs: z.coerce.number().nullable(),
  downloading_incremental_snapshot_remaining_secs: z.coerce.number().nullable(),
  downloading_incremental_snapshot_throughput: z.coerce.number().nullable(),
  downloading_incremental_snapshot_total_bytes: z.coerce.number().nullable(),
  downloading_incremental_snapshot_current_bytes: z.coerce.number().nullable(),

  // processing ledger
  ledger_slot: z.coerce.number().nullable(),
  ledger_max_slot: z.coerce.number().nullable(),

  // waiting for supermajority
  waiting_for_supermajority_slot: z.coerce.number().nullable(),
  waiting_for_supermajority_stake_percent: z.coerce.number().nullable(),
});

export const computeUnitsSchema = z.object({
  max_compute_units: z.coerce.number(),
  start_timestamp_nanos: z.coerce.bigint(),
  target_end_timestamp_nanos: z.coerce.bigint(),
  txn_start_timestamps_nanos: z.coerce.bigint().array(),
  txn_stop_timestamps_nanos: z.coerce.bigint().array(),
  txn_compute_units_requested: z.coerce.number().array(),
  txn_compute_units_estimated: z.coerce.number().array(),
  txn_compute_units_rebated: z.coerce.number().array(),
  txn_micro_lamports_per_cu: z.coerce.bigint().array(),
  txn_error_code: z.coerce.number().array(),
  txn_from_bundle: z.boolean().array(),
  txn_is_simple_vote: z.boolean().array(),
  txn_bank_idx: z.coerce.number().array(),
});

export const slotLevelSchema = z.enum([
  "incomplete",
  "completed",
  "optimistically_confirmed",
  "rooted",
  "finalized",
]);

export const slotPublishSchema = z.object({
  slot: z.coerce.number(),
  mine: z.boolean(),
  skipped: z.boolean(),
  level: slotLevelSchema,
  transactions: z.coerce.number().nullable(),
  vote_transactions: z.coerce.number().nullable(),
  failed_transactions: z.coerce.number().nullable(),
  priority_fee: z.coerce.number().nullable(),
  transaction_fee: z.coerce.number().nullable(),
  tips: z.coerce.number().nullable(),
  compute_units: z.coerce.number().nullable(),
  duration_nanos: z.coerce.number().nullable(),
  completed_time_nanos: z.coerce.number().nullable(),
});

export const tpsHistorySchema = z.array(
  z.tuple([
    z.coerce.number(), // total
    z.coerce.number(), // vote
    z.coerce.number(), // nonvote_success
    z.coerce.number(), // nonvote_failed
  ])
);

export const voteStateSchema = z.enum(["voting", "non-voting", "delinquent"]);

export const voteDistanceSchema = z.coerce.number();

export const skipRateSchema = z.object({
  epoch: z.coerce.number(),
  skip_rate: z.coerce.number(),
  // slots_processed: z.coerce.number(),
  // slots_skipped: z.coerce.number(),
});

export const summarySchema = z.discriminatedUnion("key", [
  summaryTopicSchema.extend({
    key: z.literal("ping"),
    value: z.null(),
    id: z.coerce.number(),
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
    key: z.literal("commit_hash"),
    value: commitHashSchema,
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
    key: z.literal("identity_balance"),
    value: identityBalanceSchema,
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
    value: z.coerce.number().array(),
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
]);

export const epochNewSchema = z.object({
  epoch: z.coerce.number(),
  start_slot: z.coerce.number(),
  end_slot: z.coerce.number(),
  excluded_stake_lamports: z.coerce.bigint(),
  staked_pubkeys: z.string().array(),
  staked_lamports: z.coerce.bigint().array(),
  leader_slots: z.coerce.number().array(),
});

export const epochSchema = z.discriminatedUnion("key", [
  epochTopicSchema.extend({
    key: z.literal("new"),
    value: epochNewSchema,
  }),
]);

const peerUpdateGossipSchema = z.object({
  wallclock: z.coerce.number(),
  shred_version: z.coerce.number(),
  version: z.string().nullable(),
  feature_set: z.coerce.number().nullable(),
  sockets: z.record(z.string(), z.string()),
});

const peerUpdateVoteAccountSchema = z.object({
  vote_account: z.string(),
  activated_stake: z.coerce.number(),
  last_vote: z.nullable(z.coerce.number()),
  root_slot: z.nullable(z.coerce.number()),
  epoch_credits: z.coerce.number(),
  commission: z.coerce.number(),
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
  timestamp_nanos: z.coerce.number(),
  tile_timers: z.coerce.number().array(),
});

export const slotResponseSchema = z.object({
  publish: slotPublishSchema,
  waterfall: txnWaterfallSchema.nullable().optional(),
  tile_primary_metric: tilePrimaryMetricSchema.nullable().optional(),
  tile_timers: tsTileTimersSchema.array().nullable().optional(),
  compute_units: computeUnitsSchema.nullable().optional(),
});

export const slotSkippedHistorySchema = z.coerce.number().array();

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

export const blockEngineStatusSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
]);

export const blockEngineUpdateSchema = z.object({
  name: z.string(),
  url: z.string(),
  status: blockEngineStatusSchema,
});

export const blockEngineSchema = z.discriminatedUnion("key", [
  blockEngineTopicSchema.extend({
    key: z.literal("update"),
    value: blockEngineUpdateSchema,
  }),
]);
