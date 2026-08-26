import * as z from "zod/mini";
import {
  BootPhaseEnum,
  ClientEnum,
  PriorityEnum,
  ScheduleStrategyEnum,
  TILE_TYPES,
} from "./entityEnums";

export const clientSchema = z.enum(ClientEnum);

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

export const scheduleStrategySchema = z.enum(ScheduleStrategyEnum);

export const tileTypeSchema = z.enum(TILE_TYPES);

export const tileSchema = z.object({
  kind: z.string(),
  kind_id: z.number(),
});

export const identityBalanceSchema = z.coerce.bigint();

export const voteCommissionSchema = z.nullable(z.number());

export const voteBalanceSchema = z.coerce.bigint();

export const rootSlotSchema = z.number();

export const optimisticallyConfirmedSlotSchema = z.number();
export const notarizedSlotSchema = z.number();
export const finalizedSlotSchema = z.number();

export const completedSlotSchema = z.number();
export const turbineSlotSchema = z.nullable(z.number());
export const repairSlotSchema = z.nullable(z.number());
export const catchUpHistorySchema = z.object({
  repair: z.array(z.number()),
  turbine: z.array(z.number()),
});

export const serverTimeNanosSchema = z.coerce.number();

export const estimatedSlotSchema = z.number();
export const resetSlotSchema = z.nullable(z.number());
export const storageSlotSchema = z.nullable(z.number());
export const voteSlotSchema = z.nullable(z.number());
export const slotCaughtUpSchema = z.nullable(z.number());
export const activeForkCountSchema = z.number();

export const estimatedSlotDurationSchema = z.number();

export const towerEstimatedTpsSchema = z.pipe(
  z.object({
    total: z.number(),
    vote: z.number(),
    nonvote_success: z.number(),
    nonvote_failed: z.number(),
  }),
  z.transform(({ total, vote, nonvote_success, nonvote_failed }) => ({
    total,
    vote,
    success: nonvote_success,
    failed: nonvote_failed,
  })),
);

export const alpenglowEstimatedTpsSchema = z.pipe(
  z.object({
    success: z.number(),
    failed: z.number(),
  }),
  z.transform(({ success, failed }) => ({
    total: success + failed,
    vote: 0,
    success,
    failed,
  })),
);

export const estimatedTpsSchema = z.union([
  towerEstimatedTpsSchema,
  alpenglowEstimatedTpsSchema,
]);

export const liveNetworkMetricsSchema = z.object({
  ingress: z.array(z.number()),
  egress: z.array(z.number()),
  ingress_ema: z.array(z.number()),
  egress_ema: z.array(z.number()),
  ingress_max_5m: z.number(),
  egress_max_5m: z.number(),
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
  next_leader_slot: z.nullable(z.number()),
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
  next_leader_slot: z.nullable(z.number()),
  tile_primary_metric: tilePrimaryMetricSchema,
});

export const prioritySchema = z.enum(PriorityEnum);

export const tileMetricsSchema = z.object({
  timers: z.array(z.nullable(z.array(z.number()))),
  sched_timers: z.array(z.nullable(z.array(z.number()))),
  in_backp: z.array(z.nullable(z.boolean())),
  backp_msgs: z.array(z.nullable(z.number())),
  alive: z.array(z.nullable(z.number())),
  nvcsw: z.array(z.nullable(z.number())),
  nivcsw: z.array(z.nullable(z.number())),
  last_cpu: z.array(z.nullable(z.number())),
  minflt: z.array(z.nullable(z.number())),
  majflt: z.array(z.nullable(z.number())),
  interrupts: z.array(z.nullable(z.number())),
  timer_ticks: z.array(z.nullable(z.number())),
  tlb_shootdowns: z.array(z.nullable(z.number())),
  priority: z.array(prioritySchema),
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
  downloading_full_snapshot_slot: z.nullable(z.number()),
  downloading_full_snapshot_peer: z.nullable(z.string()),
  downloading_full_snapshot_elapsed_secs: z.nullable(z.number()),
  downloading_full_snapshot_remaining_secs: z.nullable(z.number()),
  downloading_full_snapshot_throughput: z.nullable(z.number()),
  downloading_full_snapshot_total_bytes: z.nullable(z.coerce.number()),
  downloading_full_snapshot_current_bytes: z.nullable(z.coerce.number()),

  // downloading incremental snapshot
  downloading_incremental_snapshot_slot: z.nullable(z.number()),
  downloading_incremental_snapshot_peer: z.nullable(z.string()),
  downloading_incremental_snapshot_elapsed_secs: z.nullable(z.number()),
  downloading_incremental_snapshot_remaining_secs: z.nullable(z.number()),
  downloading_incremental_snapshot_throughput: z.nullable(z.number()),
  downloading_incremental_snapshot_total_bytes: z.nullable(z.coerce.number()),
  downloading_incremental_snapshot_current_bytes: z.nullable(z.coerce.number()),

  // processing ledger
  ledger_slot: z.nullable(z.number()),
  ledger_max_slot: z.nullable(z.number()),

  // waiting for supermajority
  waiting_for_supermajority_slot: z.nullable(z.number()),
  waiting_for_supermajority_stake_percent: z.nullable(z.number()),
});

export const bootPhaseSchema = z.enum(BootPhaseEnum);

export const bootProgressSchema = z.object({
  phase: bootPhaseSchema,
  joining_gossip_elapsed_seconds: z.optional(z.nullable(z.number())),
  loading_full_snapshot_elapsed_seconds: z.optional(z.nullable(z.number())),
  loading_full_snapshot_reset_count: z.optional(z.nullable(z.number())),
  loading_full_snapshot_slot: z.optional(z.nullable(z.number())),
  loading_full_snapshot_total_bytes_compressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_full_snapshot_read_bytes_compressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_full_snapshot_read_path: z.optional(z.nullable(z.string())),
  loading_full_snapshot_decompress_bytes_decompressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_full_snapshot_decompress_bytes_compressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_full_snapshot_insert_bytes_decompressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_full_snapshot_insert_accounts: z.optional(z.nullable(z.number())),
  loading_full_snapshot_snapwr_in_bytes_decompressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_full_snapshot_snapwr_out_bytes_decompressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_full_snapshot_snapwr_accounts: z.optional(z.nullable(z.number())),

  loading_incremental_snapshot_elapsed_seconds: z.optional(
    z.nullable(z.number()),
  ),
  loading_incremental_snapshot_reset_count: z.optional(z.nullable(z.number())),
  loading_incremental_snapshot_slot: z.optional(z.nullable(z.number())),
  loading_incremental_snapshot_total_bytes_compressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_incremental_snapshot_read_bytes_compressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_incremental_snapshot_read_path: z.optional(z.nullable(z.string())),
  loading_incremental_snapshot_decompress_bytes_decompressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_incremental_snapshot_decompress_bytes_compressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_incremental_snapshot_insert_bytes_decompressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_incremental_snapshot_insert_accounts: z.optional(
    z.nullable(z.number()),
  ),
  loading_incremental_snapshot_snapwr_in_bytes_decompressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_incremental_snapshot_snapwr_out_bytes_decompressed: z.optional(
    z.nullable(z.coerce.number()),
  ),
  loading_incremental_snapshot_snapwr_accounts: z.optional(
    z.nullable(z.number()),
  ),

  accounts_database_path: z.optional(z.nullable(z.string())),

  wait_for_supermajority_bank_hash: z.optional(z.nullable(z.string())),
  wait_for_supermajority_shred_version: z.optional(z.nullable(z.string())),
  wait_for_supermajority_attempt: z.optional(z.nullable(z.number())),
  wait_for_supermajority_total_stake: z.optional(z.nullable(z.coerce.bigint())),
  wait_for_supermajority_connected_stake: z.optional(
    z.nullable(z.coerce.bigint()),
  ),
  wait_for_supermajority_total_peers: z.optional(z.nullable(z.number())),
  wait_for_supermajority_connected_peers: z.optional(z.nullable(z.number())),

  catching_up_elapsed_seconds: z.optional(z.nullable(z.number())),
  catching_up_first_replay_slot: z.optional(z.nullable(z.number())),
});

// z.pipe(z.transform(fn), schema) is exactly classic z.preprocess(fn,
// schema), which zod/mini does not re-export
export const slotTransactionsSchema = z.pipe(
  z.transform((data: unknown) => {
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
  }),
  z.object({
    start_timestamp_nanos: z.coerce.bigint(),
    target_end_timestamp_nanos: z.coerce.bigint(),
    txn_mb_start_timestamps_nanos: z.array(z.coerce.bigint()),
    txn_mb_end_timestamps_nanos: z.array(z.coerce.bigint()),
    txn_compute_units_requested: z.array(z.number()),
    txn_compute_units_consumed: z.array(z.number()),
    txn_transaction_fee: z.array(z.coerce.bigint()),
    txn_priority_fee: z.array(z.coerce.bigint()),
    txn_tips: z.array(z.coerce.bigint()),
    txn_error_code: z.array(z.number()),
    txn_from_bundle: z.array(z.boolean()),
    txn_is_simple_vote: z.optional(z.array(z.boolean())),
    txn_bank_idx: z.array(z.number()),
    txn_preload_end_timestamps_nanos: z.array(z.coerce.bigint()),
    txn_start_timestamps_nanos: z.array(z.coerce.bigint()),
    txn_load_end_timestamps_nanos: z.array(z.coerce.bigint()),
    txn_end_timestamps_nanos: z.array(z.coerce.bigint()),
    txn_commit_end_timestamps_nanos: z.optional(z.array(z.coerce.bigint())),
    txn_arrival_timestamps_nanos: z.array(z.coerce.bigint()),
    txn_microblock_id: z.array(z.number()),
    txn_landed: z.array(z.boolean()),
    txn_signature: z.array(z.string()),
    txn_source_ipv4: z.array(z.string()),
    txn_source_tpu: z.array(z.string()),
  }),
);

export const towerSlotLevelSchema = z.enum([
  "incomplete",
  "completed",
  "optimistically_confirmed",
  "rooted",
  "finalized",
]);

export const alpenglowSlotLevelSchema = z.enum([
  "incomplete",
  "completed",
  "notarized",
  "skip_notarized",
  "rooted",
  "skipped",
]);

export const slotLevelSchema = z.union([
  towerSlotLevelSchema,
  alpenglowSlotLevelSchema,
]);

const slotPublishBaseSchema = z.object({
  slot: z.number(),
  mine: z.boolean(),
  priority_fee: z.nullable(z.coerce.bigint()),
  transaction_fee: z.nullable(z.coerce.bigint()),
  tips: z.nullable(z.coerce.bigint()),
  max_compute_units: z.nullable(z.number()),
  compute_units: z.nullable(z.number()),
  duration_nanos: z.nullable(z.number()),
  completed_time_nanos: z.nullable(z.coerce.bigint()),
  is_voter: z.optional(z.nullable(z.boolean())),
});

export const towerSlotPublishSchema = z.pipe(
  z.extend(slotPublishBaseSchema, {
    level: towerSlotLevelSchema,
    skipped: z.boolean(),
    success_nonvote_transaction_cnt: z.nullable(z.number()),
    failed_nonvote_transaction_cnt: z.nullable(z.number()),
    success_vote_transaction_cnt: z.nullable(z.number()),
    failed_vote_transaction_cnt: z.nullable(z.number()),
    vote_latency: z.optional(z.nullable(z.number())),
    vote_latency_exact: z.optional(z.nullable(z.number())),
  }),
  z.transform(
    ({
      success_nonvote_transaction_cnt,
      failed_nonvote_transaction_cnt,
      ...p
    }) => ({
      ...p,
      success_transaction_cnt: success_nonvote_transaction_cnt,
      failed_transaction_cnt: failed_nonvote_transaction_cnt,
      vote_rewarded: null,
    }),
  ),
);

export const alpenglowSlotPublishSchema = z.pipe(
  z.extend(slotPublishBaseSchema, {
    level: alpenglowSlotLevelSchema,
    success_transaction_cnt: z.nullable(z.number()),
    failed_transaction_cnt: z.nullable(z.number()),
    notarization_kind: z.optional(z.nullable(z.enum(["regular", "fallback"]))),
    finalization_kind: z.optional(
      z.nullable(z.enum(["fast", "slow", "implicit"])),
    ),
    vote_rewarded: z.optional(z.nullable(z.boolean())),
  }),
  z.transform((p) => ({
    ...p,
    skipped: p.level === "skipped" || p.level === "skip_notarized",
    success_vote_transaction_cnt: null,
    failed_vote_transaction_cnt: null,
    vote_latency: null,
    vote_latency_exact: null,
  })),
);

export const slotPublishSchema = z.union([
  towerSlotPublishSchema,
  alpenglowSlotPublishSchema,
]);

export const towerTpsSampleSchema = z.pipe(
  z.tuple([
    z.number(), // total
    z.number(), // vote
    z.number(), // nonvote_success
    z.number(), // nonvote_failed
  ]),
  z.transform(([total, vote, nonvote_success, nonvote_failed]) => ({
    total,
    vote,
    success: nonvote_success,
    failed: nonvote_failed,
  })),
);

export const alpenglowTpsSampleSchema = z.pipe(
  z.tuple([
    z.number(), // success
    z.number(), // failed
  ]),
  z.transform(([success, failed]) => ({
    total: success + failed,
    vote: 0,
    success,
    failed,
  })),
);

export const tpsHistorySchema = z.array(
  z.union([towerTpsSampleSchema, alpenglowTpsSampleSchema]),
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

export const voteHealthSchema = z.enum([
  "disabled",
  "not_started",
  "delinquent",
  "voting",
]);
export const bundleHealthSchema = z.enum([
  "disabled",
  "disconnected",
  "connecting",
  "connected",
  "sleeping",
]);
export const replayHealthSchema = z.enum([
  "disabled",
  "not_started",
  "behind",
  "running",
]);
export const turbineHealthSchema = z.enum([
  "disabled",
  "not_started",
  "stalled",
  "repair_outpacing",
  "running",
]);

export const healthSchema = z.object({
  vote: voteHealthSchema,
  bundle: bundleHealthSchema,
  replay: replayHealthSchema,
  turbine: turbineHealthSchema,
});

export const isAlpenglowSchema = z.boolean();

export const summarySchema = z.discriminatedUnion("key", [
  z.extend(summaryTopicSchema, {
    key: z.literal("ping"),
    value: z.null(),
    id: z.number(),
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("version"),
    value: versionSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("cluster"),
    value: clusterSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("commit_hash"),
    value: commitHashSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("identity_key"),
    value: identityKeySchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("vote_key"),
    value: voteKeySchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("startup_time_nanos"),
    value: startupTimeNanosSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("schedule_strategy"),
    value: scheduleStrategySchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("tiles"),
    value: z.array(tileSchema),
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("identity_balance"),
    value: identityBalanceSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("vote_commission"),
    value: voteCommissionSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("vote_balance"),
    value: identityBalanceSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("root_slot"),
    value: rootSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("optimistically_confirmed_slot"),
    value: optimisticallyConfirmedSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("notarized_slot"),
    value: notarizedSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("finalized_slot"),
    value: finalizedSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("completed_slot"),
    value: completedSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("estimated_slot"),
    value: estimatedSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("reset_slot"),
    value: resetSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("storage_slot"),
    value: storageSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("vote_slot"),
    value: voteSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("slot_caught_up"),
    value: slotCaughtUpSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("active_fork_count"),
    value: activeForkCountSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("estimated_slot_duration_nanos"),
    value: estimatedSlotDurationSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("estimated_tps"),
    value: estimatedTpsSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("live_network_metrics"),
    value: liveNetworkMetricsSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("live_txn_waterfall"),
    value: liveTxnWaterfallSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("live_tile_primary_metric"),
    value: liveTilePrimaryMetricSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("live_tile_metrics"),
    value: tileMetricsSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("live_tile_timers"),
    value: z.array(z.number()),
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("startup_progress"),
    value: startupProgressSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("boot_progress"),
    value: bootProgressSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("tps_history"),
    value: tpsHistorySchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("vote_state"),
    value: voteStateSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("vote_distance"),
    value: voteDistanceSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("skip_rate"),
    value: skipRateSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("turbine_slot"),
    value: turbineSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("repair_slot"),
    value: repairSlotSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("catch_up_history"),
    value: catchUpHistorySchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("server_time_nanos"),
    value: serverTimeNanosSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("live_program_cache"),
    value: liveProgramCacheSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("health"),
    value: healthSchema,
  }),
  z.extend(summaryTopicSchema, {
    key: z.literal("is_alpenglow"),
    value: isAlpenglowSchema,
  }),
]);

export const epochNewSchema = z.object({
  epoch: z.number(),
  start_time_nanos: z.nullable(z.string()),
  end_time_nanos: z.nullable(z.string()),
  start_slot: z.number(),
  end_slot: z.number(),
  excluded_stake_lamports: z.coerce.bigint(),
  staked_pubkeys: z.array(z.string()),
  staked_lamports: z.array(z.coerce.bigint()),
  // Omitted by backends that let the client derive the schedule from
  // staked_lamports (worker/leaderSchedule.ts); the ws worker fills it
  // in before posting, so downstream always sees it populated.
  leader_slots: z.optional(z.array(z.number())),
  // Optional check hash of the derived schedule: FNV-1a-64 over the
  // sched array (one u32 staked_pubkeys index per 4-slot rotation,
  // ceil(slot_cnt/4) entries), each entry hashed as 4 little-endian
  // bytes; h = 0xcbf29ce484222325, per byte: h ^= byte, then
  // h *= 0x100000001b3 (mod 2^64); rendered as 16 lowercase hex chars.
  leader_slots_hash: z.optional(z.string()),
  target_slot_duration_nanos: z.optional(z.number()),
});

export const epochSchema = z.discriminatedUnion("key", [
  z.extend(epochTopicSchema, {
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
  peer_names: z.array(z.string()),
  peer_identities: z.array(z.string()),
  peer_throughput: z.array(z.number()),
});

export const gossipStorageStatsSchema = z.object({
  capacity: z.number(),
  expired_count: z.number(),
  evicted_count: z.number(),
  count: z.array(z.number()),
  count_tx: z.array(z.number()),
  bytes_tx: z.array(z.number()),
});

export const gossipMessageStatsSchema = z.object({
  num_bytes_rx: z.array(z.number()),
  num_bytes_tx: z.array(z.number()),
  num_messages_rx: z.array(z.number()),
  num_messages_tx: z.array(z.number()),
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

export const gossipQueryRowsSchema = z.nullable(
  z.record(z.string(), z.record(z.string(), gossipCellDataSchema)),
);

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
  z.extend(gossipTopicSchema, {
    key: z.literal("network_stats"),
    value: gossipNetworkStatsSchema,
  }),
  z.extend(gossipTopicSchema, {
    key: z.literal("peers_size_update"),
    value: gossipPeersSizeUpdateSchema,
  }),
  z.extend(gossipTopicSchema, {
    key: z.literal("query_scroll"),
    value: gossipQueryRowsSchema,
  }),
  z.extend(gossipTopicSchema, {
    key: z.literal("query_sort"),
    value: gossipQueryRowsSchema,
  }),
  z.extend(gossipTopicSchema, {
    key: z.literal("view_update"),
    value: gossipViewUpdateSchema,
  }),
]);

const peerUpdateGossipSchema = z.object({
  client_id: z.optional(z.nullable(z.number())),
  wallclock: z.number(),
  shred_version: z.number(),
  version: z.nullable(z.string()),
  feature_set: z.nullable(z.number()),
  sockets: z.record(z.string(), z.string()),
  country_code: z.optional(z.nullable(z.string())), // undefined for Frankendancer client
  city_name: z.optional(z.nullable(z.string())), // undefined for Frankendancer client
});

const peerUpdateVoteAccountSchema = z.object({
  vote_account: z.string(),
  activated_stake: z.coerce.bigint(),
  // Frankendancer only, omitted by the Firedancer client
  last_vote: z.optional(z.nullable(z.number())),
  root_slot: z.optional(z.nullable(z.number())),
  epoch_credits: z.optional(z.number()),
  commission: z.optional(z.number()),
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
  add: z.optional(z.array(peerUpdateSchema)),
  update: z.optional(z.array(peerUpdateSchema)),
  remove: z.optional(z.array(peerRemoveSchema)),
});

export const peersSchema = z.discriminatedUnion("key", [
  z.extend(peersTopicSchema, {
    key: z.literal("update"),
    value: peersUpdateSchema,
  }),
]);

const tsTileTimersSchema = z.object({
  timestamp_nanos: z.string(),
  tile_timers: z.array(z.number()),
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
  used_account_write_costs: z.array(writeAcctCostSchema),
  used_total_bytes: z.number(),
  used_total_microblocks: z.number(),
  max_total_block_cost: z.number(),
  max_total_vote_cost: z.number(),
  max_account_write_cost: z.number(),
  max_total_bytes: z.number(),
  max_total_microblocks: z.number(),
});

const slotScheduleStatsSchema = z.object({
  block_hash: z.optional(z.string()), // undefined for Frankendancer client
  end_slot_reason: z.optional(z.string()), // undefined for Frankendancer client
  slot_schedule_counts: z.array(z.number()),
  end_slot_schedule_counts: z.array(z.number()),
  pending_smallest_cost: z.nullable(z.number()),
  pending_smallest_bytes: z.nullable(z.number()),
  pending_vote_smallest_cost: z.nullable(z.number()),
  pending_vote_smallest_bytes: z.nullable(z.number()),
});

export const slotResponseSchema = z.object({
  publish: slotPublishSchema,
  waterfall: z.optional(z.nullable(txnWaterfallSchema)),
  tile_primary_metric: z.optional(z.nullable(tilePrimaryMetricSchema)),
  tile_timers: z.optional(z.nullable(z.array(tsTileTimersSchema))),
  scheduler_counts: z.optional(z.nullable(z.array(schedulerCountsSchema))),
  transactions: z.optional(z.nullable(slotTransactionsSchema)),
  limits: z.optional(z.nullable(slotLimitsSchema)),
  scheduler_stats: z.optional(z.nullable(slotScheduleStatsSchema)),
});

export const slotSkippedHistorySchema = z.array(z.number());
export const slotSkippedHistoryClusterSchema = z.array(z.number());

export const slotRankingsSchema = z.object({
  slots_largest_tips: z.array(z.number()),
  vals_largest_tips: z.array(z.coerce.bigint()),
  slots_smallest_tips: z.array(z.number()),
  vals_smallest_tips: z.array(z.coerce.bigint()),
  slots_largest_fees: z.array(z.number()),
  vals_largest_fees: z.array(z.coerce.bigint()),
  slots_smallest_fees: z.array(z.number()),
  vals_smallest_fees: z.array(z.coerce.bigint()),
  slots_largest_rewards: z.array(z.number()),
  vals_largest_rewards: z.array(z.coerce.bigint()),
  slots_smallest_rewards: z.array(z.number()),
  vals_smallest_rewards: z.array(z.coerce.bigint()),
  slots_largest_duration: z.array(z.number()),
  vals_largest_duration: z.array(z.coerce.bigint()),
  slots_smallest_duration: z.array(z.number()),
  vals_smallest_duration: z.array(z.coerce.bigint()),
  slots_largest_compute_units: z.array(z.number()),
  vals_largest_compute_units: z.array(z.coerce.bigint()),
  slots_smallest_compute_units: z.array(z.number()),
  vals_smallest_compute_units: z.array(z.coerce.bigint()),
  slots_largest_skipped: z.array(z.number()),
  vals_largest_skipped: z.array(z.coerce.bigint()),
  slots_smallest_skipped: z.array(z.number()),
  vals_smallest_skipped: z.array(z.coerce.bigint()),
});

export const liveShredsSchema = z.object({
  reference_slot: z.number(),
  reference_ts: z.coerce.bigint(),
  slot_delta: z.array(z.number()),
  shred_idx: z.array(z.nullable(z.number())),
  event: z.array(z.number()),
  event_ts_delta: z.array(z.coerce.number()),
});

export const slotSchema = z.discriminatedUnion("key", [
  z.extend(slotTopicSchema, {
    key: z.literal("skipped_history"),
    value: slotSkippedHistorySchema,
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("skipped_history_cluster"),
    value: slotSkippedHistoryClusterSchema,
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("update"),
    value: slotResponseSchema,
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("query"),
    value: z.nullable(slotResponseSchema),
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("query_detailed"),
    value: z.nullable(slotResponseSchema),
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("query_transactions"),
    value: z.nullable(slotResponseSchema),
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("query_rankings"),
    value: slotRankingsSchema,
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("live_shreds"),
    value: liveShredsSchema,
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("late_votes_history"),
    value: z.union([
      z.object({
        slot: z.array(z.number()),
        latency: z.array(z.nullable(z.number())),
      }),
      z.object({
        slot: z.array(z.number()),
        latency_exact: z.array(z.nullable(z.number())),
      }),
    ]),
  }),
  z.extend(slotTopicSchema, {
    key: z.literal("missed_vote_history"),
    value: z.object({
      slot: z.array(z.number()),
    }),
  }),
]);

export const blockEngineStatusSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "sleeping",
]);

export const blockEngineUpdateSchema = z.object({
  name: z.string(),
  url: z.string(),
  ip: z.optional(z.string()),
  status: blockEngineStatusSchema,
});

export const blockEngineSchema = z.discriminatedUnion("key", [
  z.extend(blockEngineTopicSchema, {
    key: z.literal("update"),
    value: blockEngineUpdateSchema,
  }),
]);

export const supermajorityEpochSchema = z.object({
  staked_pubkeys: z.array(z.string()),
  staked_lamports: z.array(z.coerce.bigint()),
  infos: z.array(z.nullable(peerUpdateInfoSchema)),
});
const supermajorityPeerAddSchema = z.array(z.string());
const supermajorityPeerRemoveSchema = z.array(z.string());

export const supermajoritySchema = z.discriminatedUnion("key", [
  z.extend(supermajorityTopicSchema, {
    key: z.literal("stakes"),
    value: supermajorityEpochSchema,
  }),
  z.extend(supermajorityTopicSchema, {
    key: z.literal("peer_add"),
    value: supermajorityPeerAddSchema,
  }),
  z.extend(supermajorityTopicSchema, {
    key: z.literal("peer_remove"),
    value: supermajorityPeerRemoveSchema,
  }),
]);

const accountsDiskSchema = z.object({
  accounts_total: z.number(),
  accounts_capacity: z.number(),
  allocated_bytes: z.number(),
  current_bytes: z.number(),
  used_bytes: z.number(),
});

const accountsCompactionSchema = z.object({
  in_compaction: z.number(),
  compactions_requested: z.number(),
  compactions_completed: z.number(),
  accounts_relocated_bytes: z.number(),
  relocated_bytes_per_sec: z.number(),
  next_compaction_remaining_seconds: z.nullable(z.number()),
  next_compaction_partition_idx: z.nullable(z.number()),
});

const accountsCacheClassSchema = z.object({
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

const accountsCacheSchema = z.object({
  hit_rate_ema: z.number(),
  size_bytes: z.number(),
  classes: z.array(accountsCacheClassSchema),
});

const accountsIoSchema = z.object({
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

const accountsTileSchema = z.object({
  name: z.string(),
  kind_id: z.number(),
  joiner_type: z.string(),
  status: z.number(),
  acquired: z.number(),
  bytes_read: z.number(),
  bytes_written: z.number(),
  acquire_calls_per_sec: z.number(),
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
  hit_rate_ema: z.number(),
  acquired_history: z.array(z.number()),
  acquired_writable_history: z.array(z.number()),
});

export const partitionTierSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(255),
]);

export const compactionStateSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);

export const accountsPartitionSchema = z.object({
  partition_idx: z.number(),
  file_offset: z.number(),
  tier: partitionTierSchema,
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
  compaction_state: compactionStateSchema,
  compaction_frac: z.number(),
  is_write_head: z.boolean(),
});

export const accountsStatsSchema = z.object({
  sample_time_nanos: z.number(),
  disk: accountsDiskSchema,
  compaction: accountsCompactionSchema,
  cache: accountsCacheSchema,
  io: accountsIoSchema,
  tiles: z.array(accountsTileSchema),
  partitions: z.array(accountsPartitionSchema),
});

export const accountsSchema = z.discriminatedUnion("key", [
  z.extend(accountsTopicSchema, {
    key: z.literal("stats"),
    value: accountsStatsSchema,
  }),
]);
