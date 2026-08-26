// Behavior locks for the zod/mini entity schemas (worker bundle).  The
// zod->zod/mini migration itself was verified with a differential
// harness against the frozen classic schemas over 400 live-captured
// frames plus ~25k fuzzed corruptions; these tests keep the semantics
// the app depends on pinned without that corpus.
import { describe, expect, it } from "vitest";
import { WsMessageSchema } from "../api/worker/wsMessage";
import { slotTransactionsSchema } from "../api/entities";

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

  it("enforces tuple arity in tps_history", () => {
    expect(
      WsMessageSchema.safeParse(frame("summary", "tps_history", [[1, 2, 3, 4]]))
        .success,
    ).toBe(true);
    expect(
      WsMessageSchema.safeParse(frame("summary", "tps_history", [[1, 2, 3]]))
        .success,
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
