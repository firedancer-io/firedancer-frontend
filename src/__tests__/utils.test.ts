import { expect, describe, it } from "vitest";
import {
  formatTimeNanos,
  getDiscountedVoteLatency,
  getDurationText,
  hasLateVote,
} from "../utils";
import { Duration } from "luxon";
import type { SlotPublish } from "../api/types";

describe("getDurationText", () => {
  it("shows Never if duration is not defined", () => {
    expect(getDurationText(undefined)).toEqual("Never");
  });

  it("shows 0s if duration is less than a second", () => {
    expect(
      getDurationText(
        Duration.fromObject({
          millisecond: 999,
        }),
      ),
    ).toEqual("0s");
  });

  it("shows full duration", () => {
    expect(
      getDurationText(
        Duration.fromObject({
          years: 1,
          months: 2,
          weeks: 3,
          days: 20,
          hours: 13,
          minutes: 4,
          seconds: 52,
        }),
      ),
    ).toEqual("1y 2m 3w 20d 13h 4m 52s");
  });

  it("shows full duration, omitting zero values", () => {
    expect(
      getDurationText(
        Duration.fromObject({
          years: 1,
          months: 2,
          weeks: 0,
          days: 20,
          hours: 0,
          minutes: 4,
          seconds: 0,
        }),
      ),
    ).toEqual("1y 2m 20d 4m");
  });

  it("shows duration without seconds", () => {
    expect(
      getDurationText(
        Duration.fromObject({
          years: 1,
          months: 2,
          weeks: 3,
          days: 20,
          hours: 13,
          minutes: 4,
          seconds: 52,
        }),
        {
          omitSeconds: true,
        },
      ),
    ).toEqual("1y 2m 3w 20d 13h 4m");
  });

  describe("showTwoSignificantUnits", () => {
    it("shows the two most significant units", () => {
      expect(
        getDurationText(
          Duration.fromObject({
            years: 1,
            months: 2,
            weeks: 3,
            days: 20,
            hours: 13,
            minutes: 4,
            seconds: 52,
          }),
          {
            showOnlyTwoSignificantUnits: true,
          },
        ),
      ).toEqual("1y 2m");

      expect(
        getDurationText(
          Duration.fromObject({
            years: 0,
            months: 0,
            weeks: 3,
            days: 20,
            hours: 13,
            minutes: 4,
            seconds: 52,
          }),
          {
            showOnlyTwoSignificantUnits: true,
          },
        ),
      ).toEqual("3w 20d");
    });

    it("shows zero second most significant unit value", () => {
      expect(
        getDurationText(
          Duration.fromObject({
            years: 0,
            months: 2,
            weeks: 0,
            days: 20,
            hours: 13,
            minutes: 4,
            seconds: 52,
          }),
          {
            showOnlyTwoSignificantUnits: true,
          },
        ),
      ).toEqual("2m 0w");
    });

    it("shows only seconds if duration is less than a minute", () => {
      expect(
        getDurationText(
          Duration.fromObject({
            years: 0,
            months: 0,
            weeks: 0,
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 52,
          }),
          {
            showOnlyTwoSignificantUnits: false,
          },
        ),
      ).toEqual("52s");
    });
  });
});

describe("formatTimeNanos", () => {
  it("formats times correctly", () => {
    expect(formatTimeNanos(1764892025356640223n)).toEqual({
      inSeconds: "Dec 4, 5:47:05 PM CST",
      inMillis: "Dec 4, 5:47:05.356 PM CST",
      inNanos: "Dec 4, 5:47:05.356640223 PM CST",
    });
  });

  it("zero prefixes nanos correctly", () => {
    expect(formatTimeNanos(1764921600000000123n)).toEqual({
      inSeconds: "Dec 5, 2:00:00 AM CST",
      inMillis: "Dec 5, 2:00:00.000 AM CST",
      inNanos: "Dec 5, 2:00:00.000000123 AM CST",
    });
  });

  it("custom format options", () => {
    expect(
      formatTimeNanos(1764892025356640223n, {
        timezone: "local",
        showTimezoneName: false,
      }),
    ).toEqual({
      inSeconds: "Dec 4, 5:47:05 PM",
      inMillis: "Dec 4, 5:47:05.356 PM",
      inNanos: "Dec 4, 5:47:05.356640223 PM",
    });

    expect(
      formatTimeNanos(1764892025356640223n, {
        timezone: "utc",
        showTimezoneName: true,
      }),
    ).toEqual({
      inSeconds: "Dec 4, 11:47:05 PM UTC",
      inMillis: "Dec 4, 11:47:05.356 PM UTC",
      inNanos: "Dec 4, 11:47:05.356640223 PM UTC",
    });
  });
});

describe("hasLateVote and getDiscountedVoteLatency", () => {
  it("slot is not rooted", () => {
    const skippedClusterSlots = new Set<number>();
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "optimistically_confirmed",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 2,
    };
    expect(hasLateVote(publish)).toBeFalsy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(2);
  });

  it("slot has null vote latency", () => {
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: null,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(hasLateVote({ ...publish, skipped: true })).toBeFalsy();
  });

  it("slot has > 1 vote latency", () => {
    const skippedClusterSlots = new Set<number>();
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 2,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(2);
  });

  it("no skipped slots within latency range", () => {
    const skippedClusterSlots = new Set<number>([6, 7]);
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 5,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(5);
  });

  it("has some skipped slots within latency range", () => {
    const skippedClusterSlots = new Set<number>([3, 5]);
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 5,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(3);
  });

  it("all slots within latency range are skipped", () => {
    const skippedClusterSlots = new Set<number>([2, 3, 4, 5]);
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 5,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(1);
  });
});
