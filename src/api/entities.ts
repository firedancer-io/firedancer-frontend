import { z } from "zod";

export const clientSchema = z.enum(["Frankendancer", "Firedancer"]);
export const ClientEnum = clientSchema.enum;

const summaryTopicSchema = z.object({
  topic: z.literal("summary"),
});

const epochTopicSchema = z.object({
  topic: z.literal("epoch"),
});

const gossipTopicSchema = z.object({
  topic: z.literal("gossip"),
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

const supermajorityTopicSchema = z.object({
  topic: z.literal("wait_for_supermajority"),
});

const accountsTopicSchema = z.object({
  topic: z.literal("accounts"),
});

export const topicSchema = z.discriminatedUnion("topic", [
  summaryTopicSchema,
  epochTopicSchema,
  gossipTopicSchema,
  peersTopicSchema,
  slotTopicSchema,
  blockEngineTopicSchema,
  supermajorityTopicSchema,
  accountsTopicSchema,
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
export const voteKeySchema = z.string();

export const startupTimeNanosSchema = z.coerce.bigint();

export const scheduleStrategySchema = z.enum(["perf", "balanced", "revenue"]);
export const ScheduleStrategyEnum = scheduleStrategySchema.enum;

export const tileTypeSchema = z.enum([
  "sock",
  "net",
  "quic",
  "bundle",
  "verify",
  "dedup",
  "resolv", // Firedancer
  "resolh", // Frankendancer
  "pack",
  "execle", // Firedancer
  "bank", // Frankendancer
  "poh", // Firedancer
  "pohh", // Frankendancer
  "shred",
  "store",

  // snapshot
  "snapct",
  "snapld",
  "snapdc",
  "snapin",

  // shred tiles
  "netlnk",
  "metric",
  "ipecho",
  "gossvf",
  "gossip",
  "repair",
  "replay",
  "execrp",
  "tower",
  "txsend",
  "sign",
  "rpc",
  "gui",

  // others
  "http",
  "plugin",
  "cswtch",
  "genesi",
  "diag",
  "event",
]);

export const tileSchema = z.object({
  kind: z.string(),
  kind_id: z.number(),
});

export const identityBalanceSchema = z.coerce.bigint();

export const voteBalanceSchema = z.coerce.bigint();

export const rootSlotSchema = z.number();

export const optimisticallyConfirmedSlotSchema = z.number();

export const completedSlotSchema = z.number();
export const turbineSlotSchema = z.number().nullable();
export const repairSlotSchema = z.number().nullable();
export const catchUpHistorySchema = z.object({
  repair: z.number().array(),
  turbine: z.number().array(),
});

export const serverTimeNanosSchema = z.coerce.number();

export const estimatedSlotSchema = z.number();
export const resetSlotSchema = z.number().nullable();
export const storageSlotSchema = z.number().nullable();
export const voteSlotSchema = z.number();
export const slotCaughtUpSchema = z.number().nullable();
export const activeForkCountSchema = z.number();

export const estimatedSlotDurationSchema = z.number();

export const estimatedTpsSchema = z.object({
  total: z.number(),
  vote: z.number(),
  nonvote_success: z.number(),
  nonvote_failed: z.number(),
});

export const liveNetworkMetricsSchema = z.object({
  ingress: z.array(z.number()),
  egress: z.array(z.number()),
});

export const txnWaterfallInSchema = z.object({
  pack_cranked: z.number(),
  pack_retained: z.number(),
  resolv_retained: z.number(),
  quic: z.number(),
  udp: z.number(),
  gossip: z.number(),
  block_engine: z.number(),
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
  pack_already_executed: z.number(),
  pack_invalid_bundle: z.number(),
  pack_retained: z.number(),
  pack_leader_slow: z.number(),
  pack_wait_full: z.number(),
  pack_expired: z.number(),
  bank_invalid: z.number(),
  bank_nonce_already_advanced: z.number(),
  bank_nonce_advance_failed: z.number(),
  bank_nonce_wrong_blockhash: z.number(),
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
  bundle_rtt_smoothed_millis: z.number(),
  bundle_rx_delay_millis_p90: z.number(),
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

export const tileMetricsSchema = z.object({
  timers: z.array(z.array(z.number()).nullable()),
  sched_timers: z.array(z.array(z.number()).nullable()),
  in_backp: z.array(z.boolean().nullable()),
  backp_msgs: z.array(z.number().nullable()),
  alive: z.array(z.number().nullable()),
  nvcsw: z.array(z.number().nullable()),
  nivcsw: z.array(z.number().nullable()),
  last_cpu: z.array(z.number().nullable()),
  minflt: z.array(z.number().nullable()),
  majflt: z.array(z.number().nullable()),
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
  downloading_full_snapshot_total_bytes: z.coerce.number().nullable(),
  downloading_full_snapshot_current_bytes: z.coerce.number().nullable(),

  // downloading incremental snapshot
  downloading_incremental_snapshot_slot: z.number().nullable(),
  downloading_incremental_snapshot_peer: z.string().nullable(),
  downloading_incremental_snapshot_elapsed_secs: z.number().nullable(),
  downloading_incremental_snapshot_remaining_secs: z.number().nullable(),
  downloading_incremental_snapshot_throughput: z.number().nullable(),
  downloading_incremental_snapshot_total_bytes: z.coerce.number().nullable(),
  downloading_incremental_snapshot_current_bytes: z.coerce.number().nullable(),

  // processing ledger
  ledger_slot: z.number().nullable(),
  ledger_max_slot: z.number().nullable(),

  // waiting for supermajority
  waiting_for_supermajority_slot: z.number().nullable(),
  waiting_for_supermajority_stake_percent: z.number().nullable(),
});

export const bootPhaseSchema = z.enum([
  "joining_gossip",
  "loading_full_snapshot",
  "loading_incremental_snapshot",
  "catching_up",
  "waiting_for_supermajority",
  "running",
]);

export const BootPhaseEnum = bootPhaseSchema.enum;

export const bootProgressSchema = z.object({
  phase: bootPhaseSchema,
  joining_gossip_elapsed_seconds: z.number().nullable().optional(),
  loading_full_snapshot_elapsed_seconds: z.number().nullable().optional(),
  loading_full_snapshot_reset_count: z.number().nullable().optional(),
  loading_full_snapshot_slot: z.number().nullable().optional(),
  loading_full_snapshot_total_bytes_compressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_full_snapshot_read_bytes_compressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_full_snapshot_read_path: z.string().nullable().optional(),
  loading_full_snapshot_decompress_bytes_decompressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_full_snapshot_decompress_bytes_compressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_full_snapshot_insert_bytes_decompressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_full_snapshot_insert_accounts: z.number().nullable().optional(),

  loading_incremental_snapshot_elapsed_seconds: z
    .number()
    .nullable()
    .optional(),
  loading_incremental_snapshot_reset_count: z.number().nullable().optional(),
  loading_incremental_snapshot_slot: z.number().nullable().optional(),
  loading_incremental_snapshot_total_bytes_compressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_incremental_snapshot_read_bytes_compressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_incremental_snapshot_read_path: z.string().nullable().optional(),
  loading_incremental_snapshot_decompress_bytes_decompressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_incremental_snapshot_decompress_bytes_compressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_incremental_snapshot_insert_bytes_decompressed: z.coerce
    .number()
    .nullable()
    .optional(),
  loading_incremental_snapshot_insert_accounts: z
    .number()
    .nullable()
    .optional(),

  wait_for_supermajority_bank_hash: z.string().nullable().optional(),
  wait_for_supermajority_shred_version: z.string().nullable().optional(),
  wait_for_supermajority_attempt: z.number().nullable().optional(),
  wait_for_supermajority_total_stake: z.coerce.bigint().nullable().optional(),
  wait_for_supermajority_connected_stake: z.coerce
    .bigint()
    .nullable()
    .optional(),
  wait_for_supermajority_total_peers: z.number().nullable().optional(),
  wait_for_supermajority_connected_peers: z.number().nullable().optional(),

  catching_up_elapsed_seconds: z.number().nullable().optional(),
  catching_up_first_replay_slot: z.number().nullable().optional(),
});

export const slotTransactionsSchema = z.preprocess(
  (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    const d = data as Record<string, unknown>;
    return {
      ...d,
      // Forwards/Backwards compatibility for upcoming name change
      txn_preload_end_timestamps_nanos:
        d.txn_preload_end_timestamps_nanos ??
        d.txn_check_start_timestamps_nanos,
      txn_start_timestamps_nanos:
        d.txn_start_timestamps_nanos ?? d.txn_load_start_timestamps_nanos,
      txn_load_end_timestamps_nanos:
        d.txn_load_end_timestamps_nanos ?? d.txn_execute_start_timestamps_nanos,
      txn_end_timestamps_nanos:
        d.txn_end_timestamps_nanos ?? d.txn_commit_start_timestamps_nanos,
    };
  },
  z.object({
    start_timestamp_nanos: z.coerce.bigint(),
    target_end_timestamp_nanos: z.coerce.bigint(),
    txn_mb_start_timestamps_nanos: z.coerce.bigint().array(),
    txn_mb_end_timestamps_nanos: z.coerce.bigint().array(),
    txn_compute_units_requested: z.number().array(),
    txn_compute_units_consumed: z.number().array(),
    txn_transaction_fee: z.coerce.bigint().array(),
    txn_priority_fee: z.coerce.bigint().array(),
    txn_tips: z.coerce.bigint().array(),
    txn_error_code: z.number().array(),
    txn_from_bundle: z.boolean().array(),
    txn_is_simple_vote: z.boolean().array(),
    txn_bank_idx: z.number().array(),
    txn_preload_end_timestamps_nanos: z.coerce.bigint().array(),
    txn_start_timestamps_nanos: z.coerce.bigint().array(),
    txn_load_end_timestamps_nanos: z.coerce.bigint().array(),
    txn_end_timestamps_nanos: z.coerce.bigint().array(),
    txn_commit_end_timestamps_nanos: z.coerce.bigint().array().optional(),
    txn_arrival_timestamps_nanos: z.coerce.bigint().array(),
    txn_microblock_id: z.number().array(),
    txn_landed: z.boolean().array(),
    txn_signature: z.string().array(),
    txn_source_ipv4: z.string().array(),
    txn_source_tpu: z.string().array(),
  }),
);

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
  success_nonvote_transaction_cnt: z.number().nullable(),
  failed_nonvote_transaction_cnt: z.number().nullable(),
  success_vote_transaction_cnt: z.number().nullable(),
  failed_vote_transaction_cnt: z.number().nullable(),
  priority_fee: z.coerce.bigint().nullable(),
  transaction_fee: z.coerce.bigint().nullable(),
  tips: z.coerce.bigint().nullable(),
  max_compute_units: z.number().nullable(),
  compute_units: z.number().nullable(),
  duration_nanos: z.number().nullable(),
  completed_time_nanos: z.coerce.bigint().nullable(),
  vote_latency: z.number().nullable(),
});

export const tpsHistorySchema = z.array(
  z.tuple([
    z.number(), // total
    z.number(), // vote
    z.number(), // nonvote_success
    z.number(), // nonvote_failed
  ]),
);

export const voteStateSchema = z.enum(["voting", "non-voting", "delinquent"]);

export const voteDistanceSchema = z.number();

export const skipRateSchema = z.object({
  epoch: z.number(),
  skip_rate: z.number(),
  // slots_processed: z.number(),
  // slots_skipped: z.number(),
});

export const liveProgramCacheSchema = z.object({
  hits: z.number(),
  lookups: z.number(),
  insertions: z.number(),
  insertion_bytes: z.number(),
  evictions: z.number(),
  eviction_bytes: z.number(),
  spills: z.number(),
  spill_bytes: z.number(),
  free_bytes: z.number(),
  size_bytes: z.number(),
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
    key: z.literal("commit_hash"),
    value: commitHashSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("identity_key"),
    value: identityKeySchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("vote_key"),
    value: voteKeySchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("startup_time_nanos"),
    value: startupTimeNanosSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("schedule_strategy"),
    value: scheduleStrategySchema,
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
    key: z.literal("vote_balance"),
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
    key: z.literal("reset_slot"),
    value: resetSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("storage_slot"),
    value: storageSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("vote_slot"),
    value: voteSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("slot_caught_up"),
    value: slotCaughtUpSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("active_fork_count"),
    value: activeForkCountSchema,
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
    key: z.literal("live_network_metrics"),
    value: liveNetworkMetricsSchema,
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
    key: z.literal("live_tile_metrics"),
    value: tileMetricsSchema,
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
    key: z.literal("boot_progress"),
    value: bootProgressSchema,
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
    key: z.literal("turbine_slot"),
    value: turbineSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("repair_slot"),
    value: repairSlotSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("catch_up_history"),
    value: catchUpHistorySchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("server_time_nanos"),
    value: serverTimeNanosSchema,
  }),
  summaryTopicSchema.extend({
    key: z.literal("live_program_cache"),
    value: liveProgramCacheSchema,
  }),
]);

export const epochNewSchema = z.object({
  epoch: z.number(),
  start_time_nanos: z.string().nullable(),
  end_time_nanos: z.string().nullable(),
  start_slot: z.number(),
  end_slot: z.number(),
  excluded_stake_lamports: z.coerce.bigint(),
  staked_pubkeys: z.string().array(),
  staked_lamports: z.coerce.bigint().array(),
  leader_slots: z.number().array(),
});

export const epochSchema = z.discriminatedUnion("key", [
  epochTopicSchema.extend({
    key: z.literal("new"),
    value: epochNewSchema,
  }),
]);

export const gossipNetworkHealthSchema = z.object({
  num_push_messages_rx_success: z.number(),
  num_push_messages_rx_failure: z.number(),
  num_push_entries_rx_success: z.number(),
  num_push_entries_rx_failure: z.number(),
  num_push_entries_rx_duplicate: z.number(),
  num_pull_response_messages_rx_success: z.number(),
  num_pull_response_messages_rx_failure: z.number(),
  num_pull_response_entries_rx_success: z.number(),
  num_pull_response_entries_rx_failure: z.number(),
  num_pull_response_entries_rx_duplicate: z.number(),

  total_peers: z.number(),
  total_stake: z.coerce.bigint(),
  connected_stake: z.coerce.bigint(),
  connected_staked_peers: z.number(),
  connected_unstaked_peers: z.number(),
});

export const gossipNetworkTrafficSchema = z.object({
  total_throughput: z.number(),
  peer_names: z.string().array(),
  peer_identities: z.string().array(),
  peer_throughput: z.number().array(),
});

export const gossipStorageStatsSchema = z.object({
  capacity: z.number(),
  expired_count: z.number(),
  evicted_count: z.number(),
  count: z.number().array(),
  count_tx: z.number().array(),
  bytes_tx: z.number().array(),
});

export const gossipMessageStatsSchema = z.object({
  num_bytes_rx: z.number().array(),
  num_bytes_tx: z.number().array(),
  num_messages_rx: z.number().array(),
  num_messages_tx: z.number().array(),
});

export const gossipNetworkStatsSchema = z.object({
  health: gossipNetworkHealthSchema,
  ingress: gossipNetworkTrafficSchema,
  egress: gossipNetworkTrafficSchema,
  storage: gossipStorageStatsSchema,
  messages: gossipMessageStatsSchema,
});

export const gossipPeersSizeUpdateSchema = z.number();

export const gossipCellDataSchema = z.union([z.string(), z.number()]);

export const gossipQueryRowsSchema = z
  .record(z.string(), z.record(z.string(), gossipCellDataSchema))
  .nullable();

export const gossipViewUpdateSchema = z.object({
  changes: z.array(
    z.object({
      row_index: z.number(),
      column_name: z.string(),
      new_value: gossipCellDataSchema,
    }),
  ),
});

export const gossipSchema = z.discriminatedUnion("key", [
  gossipTopicSchema.extend({
    key: z.literal("network_stats"),
    value: gossipNetworkStatsSchema,
  }),
  gossipTopicSchema.extend({
    key: z.literal("peers_size_update"),
    value: gossipPeersSizeUpdateSchema,
  }),
  gossipTopicSchema.extend({
    key: z.literal("query_scroll"),
    value: gossipQueryRowsSchema,
  }),
  gossipTopicSchema.extend({
    key: z.literal("query_sort"),
    value: gossipQueryRowsSchema,
  }),
  gossipTopicSchema.extend({
    key: z.literal("view_update"),
    value: gossipViewUpdateSchema,
  }),
]);

const peerUpdateGossipSchema = z.object({
  client_id: z.number().nullable().optional(),
  wallclock: z.number(),
  shred_version: z.number(),
  version: z.string().nullable(),
  feature_set: z.number().nullable(),
  sockets: z.record(z.string(), z.string()),
  country_code: z.string().nullable().optional(), // undefined for Frankendancer client
  city_name: z.string().nullable().optional(), // undefined for Frankendancer client
});

const peerUpdateVoteAccountSchema = z.object({
  vote_account: z.string(),
  activated_stake: z.coerce.bigint(),
  last_vote: z.nullable(z.number()),
  root_slot: z.nullable(z.number()),
  epoch_credits: z.number(),
  commission: z.number(),
  delinquent: z.boolean(),
});

export const peerUpdateInfoSchema = z.object({
  name: z.nullable(z.string()),
  details: z.nullable(z.string()),
  website: z.nullable(z.string()),
  icon_url: z.nullable(z.string()),
  keybase_username: z.nullable(z.string()),
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
  timestamp_nanos: z.string(),
  tile_timers: z.number().array(),
});

export const schedulerCountsSchema = z.object({
  timestamp_nanos: z.coerce.bigint(),
  regular: z.number(),
  votes: z.number(),
  conflicting: z.number(),
  bundles: z.number(),
});

const writeAcctCostSchema = z.object({
  account: z.string(),
  cost: z.number(),
});

const slotLimitsSchema = z.object({
  used_total_block_cost: z.number(),
  used_total_vote_cost: z.number(),
  used_account_write_costs: writeAcctCostSchema.array(),
  used_total_bytes: z.number(),
  used_total_microblocks: z.number(),
  max_total_block_cost: z.number(),
  max_total_vote_cost: z.number(),
  max_account_write_cost: z.number(),
  max_total_bytes: z.number(),
  max_total_microblocks: z.number(),
});

const slotScheduleStatsSchema = z.object({
  block_hash: z.string().optional(), // undefined for Frankendancer client
  end_slot_reason: z.string().optional(), // undefined for Frankendancer client
  slot_schedule_counts: z.number().array(),
  end_slot_schedule_counts: z.number().array(),
  pending_smallest_cost: z.number().nullable(),
  pending_smallest_bytes: z.number().nullable(),
  pending_vote_smallest_cost: z.number().nullable(),
  pending_vote_smallest_bytes: z.number().nullable(),
});

export const slotResponseSchema = z.object({
  publish: slotPublishSchema,
  waterfall: txnWaterfallSchema.nullable().optional(),
  tile_primary_metric: tilePrimaryMetricSchema.nullable().optional(),
  tile_timers: tsTileTimersSchema.array().nullable().optional(),
  scheduler_counts: schedulerCountsSchema.array().nullable().optional(),
  transactions: slotTransactionsSchema.nullable().optional(),
  limits: slotLimitsSchema.nullable().optional(),
  scheduler_stats: slotScheduleStatsSchema.nullable().optional(),
});

export const slotSkippedHistorySchema = z.number().array();
export const slotSkippedHistoryClusterSchema = z.number().array();

export const slotRankingsSchema = z.object({
  slots_largest_tips: z.number().array(),
  vals_largest_tips: z.coerce.bigint().array(),
  slots_smallest_tips: z.number().array(),
  vals_smallest_tips: z.coerce.bigint().array(),
  slots_largest_fees: z.number().array(),
  vals_largest_fees: z.coerce.bigint().array(),
  slots_smallest_fees: z.number().array(),
  vals_smallest_fees: z.coerce.bigint().array(),
  slots_largest_rewards: z.number().array(),
  vals_largest_rewards: z.coerce.bigint().array(),
  slots_smallest_rewards: z.number().array(),
  vals_smallest_rewards: z.coerce.bigint().array(),
  slots_largest_duration: z.number().array(),
  vals_largest_duration: z.coerce.bigint().array(),
  slots_smallest_duration: z.number().array(),
  vals_smallest_duration: z.coerce.bigint().array(),
  slots_largest_compute_units: z.number().array(),
  vals_largest_compute_units: z.coerce.bigint().array(),
  slots_smallest_compute_units: z.number().array(),
  vals_smallest_compute_units: z.coerce.bigint().array(),
  slots_largest_skipped: z.number().array(),
  vals_largest_skipped: z.coerce.bigint().array(),
  slots_smallest_skipped: z.number().array(),
  vals_smallest_skipped: z.coerce.bigint().array(),
});

export enum ShredEvent {
  shred_repair_request = 0,
  shred_received_turbine = 1,
  shred_received_repair = 2,
  shred_replayed = 3,
  slot_complete = 4,
  shred_published = 6,
}

export const liveShredsSchema = z.object({
  reference_slot: z.number(),
  reference_ts: z.coerce.bigint(),
  slot_delta: z.number().array(),
  shred_idx: z.number().nullable().array(),
  event: z.number().array(),
  event_ts_delta: z.coerce.number().array(),
});

export const slotSchema = z.discriminatedUnion("key", [
  slotTopicSchema.extend({
    key: z.literal("skipped_history"),
    value: slotSkippedHistorySchema,
  }),
  slotTopicSchema.extend({
    key: z.literal("skipped_history_cluster"),
    value: slotSkippedHistoryClusterSchema,
  }),
  slotTopicSchema.extend({
    key: z.literal("update"),
    value: slotResponseSchema,
  }),
  slotTopicSchema.extend({
    key: z.literal("query"),
    value: slotResponseSchema.nullable(),
  }),
  slotTopicSchema.extend({
    key: z.literal("query_detailed"),
    value: slotResponseSchema.nullable(),
  }),
  slotTopicSchema.extend({
    key: z.literal("query_transactions"),
    value: slotResponseSchema.nullable(),
  }),
  slotTopicSchema.extend({
    key: z.literal("query_rankings"),
    value: slotRankingsSchema,
  }),
  slotTopicSchema.extend({
    key: z.literal("live_shreds"),
    value: liveShredsSchema,
  }),
  slotTopicSchema.extend({
    key: z.literal("late_votes_history"),
    value: z.object({
      slot: z.number().array(),
      latency: z.number().nullable().array(),
    }),
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
  ip: z.string().optional(),
  status: blockEngineStatusSchema,
});

export const blockEngineSchema = z.discriminatedUnion("key", [
  blockEngineTopicSchema.extend({
    key: z.literal("update"),
    value: blockEngineUpdateSchema,
  }),
]);

export const supermajorityEpochSchema = z.object({
  staked_pubkeys: z.string().array(),
  staked_lamports: z.coerce.bigint().array(),
  infos: z.array(peerUpdateInfoSchema.nullable()),
});
const supermajorityPeerAddSchema = z.string().array();
const supermajorityPeerRemoveSchema = z.string().array();

export const supermajoritySchema = z.discriminatedUnion("key", [
  supermajorityTopicSchema.extend({
    key: z.literal("stakes"),
    value: supermajorityEpochSchema,
  }),
  supermajorityTopicSchema.extend({
    key: z.literal("peer_add"),
    value: supermajorityPeerAddSchema,
  }),
  supermajorityTopicSchema.extend({
    key: z.literal("peer_remove"),
    value: supermajorityPeerRemoveSchema,
  }),
]);

export const accountsDiskSchema = z.object({
  accounts_total: z.number(),
  accounts_capacity: z.number(),
  allocated_bytes: z.number(),
  current_bytes: z.number(),
  used_bytes: z.number(),
});

export const accountsCompactionSchema = z.object({
  in_compaction: z.number(),
  compactions_requested: z.number(),
  compactions_completed: z.number(),
  accounts_relocated_bytes: z.number(),
  relocated_bytes_per_sec: z.number(),
});

export const accountsCacheClassSchema = z.object({
  class: z.number(),
  used_slots: z.number(),
  max_slots: z.number(),
  reserved_slots: z.number(),
  target_used_slots: z.number(),
  low_water_used_slots: z.number(),
  not_found: z.number(),
  evicted: z.number(),
  preevicted: z.number(),
  committed_new: z.number(),
  committed_overwrite: z.number(),
  not_found_per_sec: z.number(),
  evicted_per_sec: z.number(),
  preevicted_per_sec: z.number(),
  committed_new_per_sec: z.number(),
  committed_overwrite_per_sec: z.number(),
  reads_per_sec: z.number(),
  writes_per_sec: z.number(),
  hit_rate_ema: z.number(),
});

export const accountsCacheSchema = z.object({
  hit_rate_ema: z.number(),
  size_bytes: z.number(),
  classes: accountsCacheClassSchema.array(),
});

export const accountsIoSchema = z.object({
  acquired: z.number(),
  acquired_writable: z.number(),
  bytes_read: z.number(),
  bytes_copied: z.number(),
  bytes_written: z.number(),
  bytes_written_accdb: z.number(),
  read_ops: z.number(),
  write_ops: z.number(),
  acquired_per_sec: z.number(),
  acquired_writable_per_sec: z.number(),
  bytes_read_per_sec: z.number(),
  bytes_copied_per_sec: z.number(),
  bytes_written_per_sec: z.number(),
  read_ops_per_sec: z.number(),
  write_ops_per_sec: z.number(),
  prewrite_ratio: z.number(),
});

export const accountsPartitionSchema = z.object({
  partition_idx: z.number(),
  file_offset: z.number(),
  tier: z.number(),
  write_offset: z.number(),
  bytes_freed: z.number(),
  read_ops: z.number(),
  bytes_read: z.number(),
  write_ops: z.number(),
  bytes_written: z.number(),
  read_ops_per_sec: z.number(),
  bytes_read_per_sec: z.number(),
  write_ops_per_sec: z.number(),
  bytes_written_per_sec: z.number(),
  utilization: z.number(),
  fragmentation: z.number(),
  used_frac: z.number(),
  fragmented_frac: z.number(),
  compaction_trigger_frac: z.number(),
  age_seconds: z.number(),
  filled_seconds: z.number(),
  /* 0 = idle, 1 = queued, 2 = compacting */
  compaction_state: z.number(),
  compaction_frac: z.number(),
  is_write_head: z.boolean(),
});

export const accountsTileSchema = z.object({
  name: z.string(),
  kind_id: z.number(),
  joiner_type: z.enum(["RO", "RW"]),
  /* 1 = running, 2 = shutdown */
  status: z.number(),
  acquired: z.number(),
  bytes_read: z.number(),
  bytes_written: z.number(),
  acquired_per_sec: z.number(),
  acquired_writable_per_sec: z.number(),
  bytes_read_per_sec: z.number(),
  bytes_copied_per_sec: z.number(),
  bytes_written_per_sec: z.number(),
  read_ops_per_sec: z.number(),
  write_ops_per_sec: z.number(),
  not_found_per_sec: z.number(),
  evicted_per_sec: z.number(),
  committed_per_sec: z.number(),
  acquire_calls_per_sec: z.number(),
  hit_rate_ema: z.number(),
  acquired_history: z.array(z.number()),
  acquired_writable_history: z.array(z.number()),
});

export const accountsStatsSchema = z.object({
  sample_time_nanos: z.number(),
  disk: accountsDiskSchema,
  compaction: accountsCompactionSchema,
  cache: accountsCacheSchema,
  io: accountsIoSchema,
  tiles: accountsTileSchema.array(),
  partitions: accountsPartitionSchema.array(),
});

export const accountsSchema = z.discriminatedUnion("key", [
  accountsTopicSchema.extend({
    key: z.literal("stats"),
    value: accountsStatsSchema,
  }),
]);
