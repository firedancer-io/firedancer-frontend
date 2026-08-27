// Behavior locks for the zod/mini entity schemas (worker bundle).  The
// zod->zod/mini migration itself was verified with a differential
// harness against the frozen classic schemas over 400 live-captured
// frames plus ~25k fuzzed corruptions; these tests keep the semantics
// the app depends on pinned without that corpus.
import { describe, expect, it } from "vitest";
import { WsMessageSchema } from "../api/worker/wsMessage";
import {
  catchUpHistorySchema,
  liveShredsSchema,
  slotTransactionsSchema,
  tpsHistorySchema,
} from "../api/entities";

const frame = (topic: string, key: string, value: unknown) => ({
  topic,
  key,
  value,
});

describe("WsMessageSchema (zod/mini)", () => {
  it("routes topics through the nested discriminated unions", () => {
    expect(
      WsMessageSchema.safeParse({
        topic: "summary",
        key: "ping",
        value: null,
        id: 7,
      }).success,
    ).toBe(true);
    expect(
      WsMessageSchema.safeParse(frame("slot", "skipped_history", [1, 2]))
        .success,
    ).toBe(true);
    expect(
      WsMessageSchema.safeParse(frame("nonexistent", "x", 1)).success,
    ).toBe(false);
    expect(
      WsMessageSchema.safeParse(frame("summary", "nonexistent", 1)).success,
    ).toBe(false);
    expect(WsMessageSchema.safeParse({ key: "version", value: "1" }).success) //
      .toBe(false);
  });

  it("coerces bigints like BigInt(), rejecting what BigInt() throws on", () => {
    const parse = (value: unknown) =>
      WsMessageSchema.safeParse(frame("summary", "identity_balance", value));
    expect(parse("123").data?.value).toBe(123n);
    expect(parse(5).data?.value).toBe(5n);
    expect(parse("0x10").data?.value).toBe(16n);
    expect(parse(true).data?.value).toBe(1n);
    expect(parse("123456789012345678901234567890").data?.value).toBe(
      123456789012345678901234567890n,
    );
    expect(parse(1.5).success).toBe(false);
    expect(parse("12.5").success).toBe(false);
    expect(parse(null).success).toBe(false);
  });

  it("coerces numbers like Number(), rejecting NaN", () => {
    const parse = (value: unknown) =>
      WsMessageSchema.safeParse(frame("summary", "server_time_nanos", value));
    expect(parse("123").data?.value).toBe(123);
    expect(parse("abc").success).toBe(false);
  });

  it("strips unknown keys", () => {
    const parsed = WsMessageSchema.safeParse({
      ...frame("summary", "version", "1.0"),
      extra: true,
    });
    expect(parsed.data).toStrictEqual(frame("summary", "version", "1.0"));
  });

  it("enforces tuple arity in tps_history (2-, 3- and 4-column forms only)", () => {
    expect(
      WsMessageSchema.safeParse(frame("summary", "tps_history", [[1, 2, 3, 4]]))
        .success,
    ).toBe(true);
    expect(
      WsMessageSchema.safeParse(frame("summary", "tps_history", [[1, 2, 3]]))
        .success,
    ).toBe(true);
    // alpenglow [success, failed]
    expect(
      WsMessageSchema.safeParse(frame("summary", "tps_history", [[1, 2]]))
        .success,
    ).toBe(true);
    expect(
      WsMessageSchema.safeParse(frame("summary", "tps_history", [[1]])).success,
    ).toBe(false);
    expect(
      WsMessageSchema.safeParse(
        frame("summary", "tps_history", [[1, 2, 3, 4, 5]]),
      ).success,
    ).toBe(false);
  });

  it("accepts both late_votes_history union branches", () => {
    expect(
      WsMessageSchema.safeParse(
        frame("slot", "late_votes_history", { slot: [1], latency: [null, 2] }),
      ).success,
    ).toBe(true);
    expect(
      WsMessageSchema.safeParse(
        frame("slot", "late_votes_history", { slot: [1], latency_exact: [3] }),
      ).success,
    ).toBe(true);
    expect(
      WsMessageSchema.safeParse(frame("slot", "late_votes_history", { s: [] }))
        .success,
    ).toBe(false);
  });

  it("parses the peers stats aggregate exactly as the backend prints it", () => {
    // fd_gui_peers_printf_stats: counts as numbers, stakes as strings
    const parsed = WsMessageSchema.safeParse(
      frame("peers", "stats", {
        validator_count: 1477,
        rpc_count: 4310,
        active_stake: "399941148700762892",
        delinquent_stake: "725162624735358",
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.data?.topic === "peers" && parsed.data.key === "stats") {
      expect(parsed.data.value).toStrictEqual({
        validator_count: 1477,
        rpc_count: 4310,
        active_stake: 399941148700762892n,
        delinquent_stake: 725162624735358n,
      });
    } else {
      expect.unreachable("peers:stats parsed into the wrong branch");
    }
    expect(
      WsMessageSchema.safeParse(
        frame("peers", "stats", { validator_count: 1, rpc_count: 2 }),
      ).success,
    ).toBe(false);
  });

  it("exposes issues and message on failures for the worker's debug logs", () => {
    const failed = WsMessageSchema.safeParse(frame("summary", "version", 5));
    expect(failed.success).toBe(false);
    if (!failed.success) {
      expect(failed.error.issues.length).toBeGreaterThan(0);
      expect(typeof failed.error.message).toBe("string");
    }
  });
});

describe("slotTransactionsSchema preprocess pipe", () => {
  const base = {
    start_timestamp_nanos: "1",
    target_end_timestamp_nanos: "2",
    txn_mb_start_timestamps_nanos: [],
    txn_mb_end_timestamps_nanos: [],
    txn_compute_units_requested: [],
    txn_compute_units_consumed: [],
    txn_transaction_fee: [],
    txn_priority_fee: [],
    txn_tips: [],
    txn_error_code: [],
    txn_from_bundle: [],
    txn_is_simple_vote: [],
    txn_bank_idx: [],
    txn_arrival_timestamps_nanos: [],
    txn_microblock_id: [],
    txn_landed: [],
    txn_signature: [],
    txn_source_ipv4: [],
    txn_source_tpu: [],
  };

  it("fills the renamed timestamp fields from their legacy names", () => {
    const result = slotTransactionsSchema.safeParse({
      ...base,
      txn_check_start_timestamps_nanos: ["10"],
      txn_load_start_timestamps_nanos: ["11"],
      txn_execute_start_timestamps_nanos: ["12"],
      txn_commit_start_timestamps_nanos: ["13"],
    });
    expect(result.success).toBe(true);
    expect(result.data?.txn_preload_end_timestamps_nanos).toStrictEqual([10n]);
    expect(result.data?.txn_start_timestamps_nanos).toStrictEqual([11n]);
    expect(result.data?.txn_load_end_timestamps_nanos).toStrictEqual([12n]);
    expect(result.data?.txn_end_timestamps_nanos).toStrictEqual([13n]);
  });

  it("prefers the new names when both are present", () => {
    const result = slotTransactionsSchema.safeParse({
      ...base,
      txn_preload_end_timestamps_nanos: ["20"],
      txn_check_start_timestamps_nanos: ["10"],
      txn_start_timestamps_nanos: ["21"],
      txn_load_start_timestamps_nanos: ["11"],
      txn_load_end_timestamps_nanos: ["22"],
      txn_execute_start_timestamps_nanos: ["12"],
      txn_end_timestamps_nanos: ["23"],
      txn_commit_start_timestamps_nanos: ["13"],
    });
    expect(result.success).toBe(true);
    expect(result.data?.txn_preload_end_timestamps_nanos).toStrictEqual([20n]);
    expect(result.data?.txn_start_timestamps_nanos).toStrictEqual([21n]);
    expect(result.data?.txn_load_end_timestamps_nanos).toStrictEqual([22n]);
    expect(result.data?.txn_end_timestamps_nanos).toStrictEqual([23n]);
  });

  it("rejects when a required timestamp field is missing entirely", () => {
    expect(slotTransactionsSchema.safeParse(base).success).toBe(false);
  });
});

// Dual-format tolerance for the next backend cycle: each schema accepts
// today's wire format (parsing byte-identically) and the upcoming one.
describe("dual-format wire tolerance", () => {
  it("catch_up_history: flat lists, RLE [start,end] pairs, or a mix", () => {
    const old = catchUpHistorySchema.safeParse({
      repair: [5, 6, 9],
      turbine: [],
    });
    expect(old.data).toStrictEqual({ repair: [5, 6, 9], turbine: [] });

    const rle = catchUpHistorySchema.safeParse({
      repair: [
        [5, 7],
        [9, 9],
      ],
      turbine: [[2, 3]],
    });
    expect(rle.data).toStrictEqual({ repair: [5, 6, 7, 9], turbine: [2, 3] });

    const mixed = catchUpHistorySchema.safeParse({
      repair: [1, [3, 4]],
      turbine: [],
    });
    expect(mixed.data).toStrictEqual({ repair: [1, 3, 4], turbine: [] });

    expect(
      catchUpHistorySchema.safeParse({ repair: [[1]], turbine: [] }).success,
    ).toBe(false);
    expect(
      catchUpHistorySchema.safeParse({ repair: [[1, 2, 3]], turbine: [] })
        .success,
    ).toBe(false);
  });

  it("tps_history: 3-column integer counts derive the 4-column TPS", () => {
    expect(tpsHistorySchema.safeParse([[441, 2.5, 3, 4]]).data).toStrictEqual([
      { total: 441, vote: 2.5, success: 3, failed: 4 },
    ]);
    // counts over the 10s window: total = sum, all divided by 10
    expect(tpsHistorySchema.safeParse([[20, 30, 50]]).data).toStrictEqual([
      { total: 10, vote: 2, success: 3, failed: 5 },
    ]);
  });

  it("live_shreds event_ts_delta: quoted nanos or ms delta-of-deltas", () => {
    const shreds = (event_ts_delta: unknown) => ({
      reference_slot: 1,
      reference_ts: "123",
      slot_delta: [0, 0, 0],
      shred_idx: [1, null, 2],
      event: [0, 1, 2],
      event_ts_delta,
    });

    const old = liveShredsSchema.safeParse(
      shreds(["1000000", "2500000", "2500000"]),
    );
    expect(old.data?.event_ts_delta).toStrictEqual([1000000, 2500000, 2500000]);

    // second-order ms deltas: steps 5, 7, 7 -> totals 5, 12, 19 (ms)
    const dod = liveShredsSchema.safeParse(shreds([5, 2, 0]));
    expect(dod.data?.event_ts_delta).toStrictEqual([5e6, 12e6, 19e6]);

    expect(liveShredsSchema.safeParse(shreds(["abc"])).success).toBe(false);
    expect(liveShredsSchema.safeParse(shreds([true])).success).toBe(false);
  });

  it("slot batch: columnar arrays become slot:update-shaped rows", () => {
    const cols = {
      slot: [331355000, 331355001],
      mine: [false, true],
      skipped: [false, true],
      level: ["rooted", "finalized"],
      success_nonvote_transaction_cnt: [901, null],
      failed_nonvote_transaction_cnt: [17, null],
      success_vote_transaction_cnt: [740, null],
      failed_vote_transaction_cnt: [3, null],
      priority_fee: ["123456", null],
      transaction_fee: ["7890", null],
      tips: ["0", null],
      max_compute_units: [48000000, null],
      compute_units: [30123456, null],
      duration_nanos: [401000000, null],
      completed_time_nanos: ["1724800000000000000", null],
      vote_latency_exact: [1, null],
      is_voter: [true, false],
    };
    const parsed = WsMessageSchema.safeParse(frame("slot", "batch", cols));
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.key !== "batch") return;
    expect(parsed.data.value).toHaveLength(2);
    expect(parsed.data.value[0].publish).toStrictEqual({
      slot: 331355000,
      mine: false,
      skipped: false,
      level: "rooted",
      success_transaction_cnt: 901,
      failed_transaction_cnt: 17,
      success_vote_transaction_cnt: 740,
      failed_vote_transaction_cnt: 3,
      vote_rewarded: null,
      priority_fee: 123456n,
      transaction_fee: 7890n,
      tips: 0n,
      max_compute_units: 48000000,
      compute_units: 30123456,
      duration_nanos: 401000000,
      completed_time_nanos: 1724800000000000000n,
      vote_latency_exact: 1,
      is_voter: true,
    });
    // second row: every nullable column null, required scalars intact
    expect(parsed.data.value[1].publish.slot).toBe(331355001);
    expect(parsed.data.value[1].publish.level).toBe("finalized");
    expect(parsed.data.value[1].publish.tips).toBeNull();
    expect(parsed.data.value[1].publish.completed_time_nanos).toBeNull();

    // ragged columns reject the frame rather than mis-zipping rows
    expect(
      WsMessageSchema.safeParse(
        frame("slot", "batch", { ...cols, mine: [false] }),
      ).success,
    ).toBe(false);
    // unknown level enum rejects
    expect(
      WsMessageSchema.safeParse(
        frame("slot", "batch", { ...cols, level: ["rooted", "bogus"] }),
      ).success,
    ).toBe(false);
  });
});
