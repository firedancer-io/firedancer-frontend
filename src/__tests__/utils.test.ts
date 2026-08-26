import { expect, describe, it } from "vitest";
import {
  countBy,
  formatSIBytes,
  formatTimeNanos,
  getDiscountedVoteLatency,
  getDurationText,
  groupBy,
  hasLateVote,
  kebabCase,
  shuffle,
  startCase,
} from "../utils";
import { ceil, clamp, max, mean, round, sortedIndex, sum } from "../mathUtils";
import { Duration } from "../timeUtils";
import type { SlotPublish } from "../api/types";

describe("formatSIBytes", () => {
  describe("auto unit selection", () => {
    it("returns 0 with unit B for zero bytes (noDecimalForZero default)", () => {
      expect(formatSIBytes(0)).toEqual({ value: "0", unit: "B" });
    });

    it("returns zero with decimal when noDecimalForZero is false", () => {
      expect(formatSIBytes(0, 1, undefined, false)).toEqual({
        value: "0.0",
        unit: "B",
      });
    });

    it("formats bytes below 1000 as B", () => {
      expect(formatSIBytes(500)).toEqual({ value: "500.0", unit: "B" });
    });

    it("formats value at threshold boundary (999) as B", () => {
      expect(formatSIBytes(999)).toEqual({ value: "999.0", unit: "B" });
    });

    it("formats value at 1_000 as kB", () => {
      expect(formatSIBytes(1_000)).toEqual({ value: "1.0", unit: "kB" });
    });

    it("formats bytes in kB range", () => {
      expect(formatSIBytes(1_500)).toEqual({ value: "1.5", unit: "kB" });
    });

    it("formats value at 1_000_000 as MB", () => {
      expect(formatSIBytes(1_000_000)).toEqual({ value: "1.0", unit: "MB" });
    });

    it("formats bytes in MB range", () => {
      expect(formatSIBytes(2_500_000)).toEqual({ value: "2.5", unit: "MB" });
    });

    it("formats value at 1_000_000_000 as GB", () => {
      expect(formatSIBytes(1_000_000_000)).toEqual({
        value: "1.0",
        unit: "GB",
      });
    });

    it("formats bytes in GB range", () => {
      expect(formatSIBytes(3_200_000_000)).toEqual({
        value: "3.2",
        unit: "GB",
      });
    });

    it("formats value at 1_000_000_000_000 as TB", () => {
      expect(formatSIBytes(1_000_000_000_000)).toEqual({
        value: "1.0",
        unit: "TB",
      });
    });

    it("formats bytes in TB range", () => {
      expect(formatSIBytes(4_200_000_000_000)).toEqual({
        value: "4.2",
        unit: "TB",
      });
    });

    it("formats very large values in TB", () => {
      expect(formatSIBytes(1_000_000_000_000_000)).toEqual({
        value: "1000.0",
        unit: "TB",
      });
    });
  });

  describe("explicit unit override", () => {
    it("forces B unit regardless of magnitude", () => {
      expect(formatSIBytes(1_000_000, 1, "B")).toEqual({
        value: "1000000.0",
        unit: "B",
      });
    });

    it("forces kB unit regardless of magnitude", () => {
      expect(formatSIBytes(1_000_000, 1, "kB")).toEqual({
        value: "1000.0",
        unit: "kB",
      });
    });

    it("forces MB unit for small value", () => {
      expect(formatSIBytes(500, 4, "MB")).toEqual({
        value: "0.0005",
        unit: "MB",
      });
    });

    it("forces GB unit for small value", () => {
      expect(formatSIBytes(500, 7, "GB")).toEqual({
        value: "0.0000005",
        unit: "GB",
      });
    });

    it("returns zero with forced unit when bytes is 0 and noDecimalForZero is true", () => {
      expect(formatSIBytes(0, 1, "MB")).toEqual({ value: "0", unit: "MB" });
    });

    it("returns zero with forced unit and decimal when noDecimalForZero is false", () => {
      expect(formatSIBytes(0, 1, "MB", false)).toEqual({
        value: "0.0",
        unit: "MB",
      });
    });
  });

  describe("precision", () => {
    it("uses default precision of 1", () => {
      expect(formatSIBytes(1_500)).toEqual({ value: "1.5", unit: "kB" });
    });

    it("uses precision 0 (no decimal)", () => {
      expect(formatSIBytes(1_500, 0)).toEqual({ value: "2", unit: "kB" });
    });

    it("uses precision 2", () => {
      expect(formatSIBytes(1_234, 2)).toEqual({ value: "1.23", unit: "kB" });
    });

    it("uses precision 3", () => {
      expect(formatSIBytes(1_234_567, 3)).toEqual({
        value: "1.235",
        unit: "MB",
      });
    });
  });
});

describe("getDurationText", () => {
  it("shows Never if duration is not defined", () => {
    expect(getDurationText(undefined)).toEqual("Never");
  });

  it("shows 0s if duration is exactly 0", () => {
    expect(getDurationText(Duration.fromObject({ millisecond: 0 }))).toEqual(
      "0s",
    );
  });

  it("shows 1s if duration is less than a second but not 0", () => {
    expect(getDurationText(Duration.fromObject({ millisecond: 999 }))).toEqual(
      "1s",
    );
  });

  it("shows 1m if duration is less than a minute but not 0 with omitSeconds", () => {
    expect(
      getDurationText(Duration.fromObject({ millisecond: 59999 }), {
        omitSeconds: true,
      }),
    ).toEqual("1m");
    expect(
      getDurationText(Duration.fromObject({ millisecond: 999 }), {
        omitSeconds: true,
      }),
    ).toEqual("1m");
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
      inMillis: "Dec 4, 05:47:05.356 PM CST",
      inNanos: "Dec 4, 05:47:05.356640223 PM CST",
    });
  });

  it("zero prefixes nanos correctly", () => {
    expect(formatTimeNanos(1764921600000000123n)).toEqual({
      inMillis: "Dec 5, 02:00:00.000 AM CST",
      inNanos: "Dec 5, 02:00:00.000000123 AM CST",
    });
  });

  it("custom format options", () => {
    expect(
      formatTimeNanos(1764892025356640223n, {
        timezone: "local",
        showTimezoneName: false,
      }),
    ).toEqual({
      inMillis: "Dec 4, 05:47:05.356 PM",
      inNanos: "Dec 4, 05:47:05.356640223 PM",
    });

    expect(
      formatTimeNanos(1764892025356640223n, {
        timezone: "utc",
        showTimezoneName: true,
      }),
    ).toEqual({
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
      success_transaction_cnt: null,
      failed_transaction_cnt: null,
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
      vote_rewarded: null,
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
      success_transaction_cnt: null,
      failed_transaction_cnt: null,
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
      vote_rewarded: null,
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
      success_transaction_cnt: null,
      failed_transaction_cnt: null,
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
      vote_rewarded: null,
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
      success_transaction_cnt: null,
      failed_transaction_cnt: null,
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
      vote_rewarded: null,
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
      success_transaction_cnt: null,
      failed_transaction_cnt: null,
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
      vote_rewarded: null,
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
      success_transaction_cnt: null,
      failed_transaction_cnt: null,
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
      vote_rewarded: null,
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

  const exactPublish = (overrides: Partial<SlotPublish>): SlotPublish => ({
    slot: 1,
    mine: false,
    skipped: false,
    level: "rooted",
    success_transaction_cnt: null,
    failed_transaction_cnt: null,
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
    vote_latency_exact: null,
    is_voter: true,
    vote_rewarded: null,
    ...overrides,
  });

  it("exact: voter with discounted latency > 1 is late", () => {
    expect(
      hasLateVote(exactPublish({ vote_latency: 5, vote_latency_exact: 2 })),
    ).toBeTruthy();
  });

  it("exact: voter with discounted latency 1 is not late", () => {
    expect(
      hasLateVote(exactPublish({ vote_latency: 5, vote_latency_exact: 1 })),
    ).toBeFalsy();
  });

  it("exact: voter that never voted is late", () => {
    expect(
      hasLateVote(
        exactPublish({ vote_latency: null, vote_latency_exact: null }),
      ),
    ).toBeTruthy();
  });

  it("exact: non-voter is never late", () => {
    expect(
      hasLateVote(exactPublish({ is_voter: false, vote_latency_exact: null })),
    ).toBeFalsy();
    expect(
      hasLateVote(
        exactPublish({
          is_voter: false,
          vote_latency: 5,
          vote_latency_exact: 3,
        }),
      ),
    ).toBeFalsy();
  });

  it("exact: skipped slot is not late", () => {
    expect(
      hasLateVote(exactPublish({ skipped: true, vote_latency_exact: null })),
    ).toBeFalsy();
  });

  it("exact: non-rooted is not late", () => {
    expect(
      hasLateVote(
        exactPublish({
          level: "optimistically_confirmed",
          vote_latency_exact: 5,
        }),
      ),
    ).toBeFalsy();
  });
});

describe("kebabCase/startCase match lodash on their real inputs", () => {
  it("kebabCase over every colors.ts export name", async () => {
    const { default: lodashKebabCase } = await import("lodash/kebabCase");
    const colors = await import("../colors");
    for (const name of Object.keys(colors)) {
      expect(kebabCase(name), name).toBe(lodashKebabCase(name));
    }
  });

  it("startCase over every health enum option", async () => {
    const { default: lodashStartCase } = await import("lodash/startCase");
    const {
      voteHealthSchema,
      bundleHealthSchema,
      replayHealthSchema,
      turbineHealthSchema,
    } = await import("../api/entities");
    const options = [
      ...voteHealthSchema.options,
      ...bundleHealthSchema.options,
      ...replayHealthSchema.options,
      ...turbineHealthSchema.options,
    ];
    expect(options.length).toBeGreaterThan(10);
    for (const value of options) {
      expect(startCase(value), value).toBe(lodashStartCase(value));
    }
  });
});

describe("local lodash equivalents match lodash", () => {
  it("number helpers over a value grid", async () => {
    const lodash = {
      clamp: (await import("lodash/clamp")).default,
      sum: (await import("lodash/sum")).default,
      mean: (await import("lodash/mean")).default,
      max: (await import("lodash/max")).default,
      round: (await import("lodash/round")).default,
      ceil: (await import("lodash/ceil")).default,
      sortedIndex: (await import("lodash/sortedIndex")).default,
    };

    const grid = [
      0,
      1,
      -1,
      0.5,
      -0.5,
      1.005,
      -1.005,
      2.675,
      42.4242,
      1234.5678,
      1e6 + 0.123456,
      -0.000123,
      5061,
      0.1 + 0.2,
    ];
    for (const n of grid) {
      for (const p of [0, 1, 2, 4]) {
        expect(round(n, p), `round(${n}, ${p})`).toBe(lodash.round(n, p));
        expect(ceil(n, p), `ceil(${n}, ${p})`).toBe(lodash.ceil(n, p));
      }
      expect(clamp(n, -1, 1), `clamp(${n})`).toBe(lodash.clamp(n, -1, 1));
      expect(clamp(n, 0.25, 100)).toBe(lodash.clamp(n, 0.25, 100));
    }

    const arrays = [[], [1], [3, 1, 2], [0, -0.5, 7.25], grid];
    for (const a of arrays) {
      expect(sum(a), `sum([${a.join()}])`).toBe(a.length ? lodash.sum(a) : 0);
      expect(mean(a), `mean([${a.join()}])`).toBe(lodash.mean(a));
      expect(max(a), `max([${a.join()}])`).toBe(lodash.max(a));
    }

    const sorted = [[], [4], [1, 2, 2, 2, 9], [0, 10, 20, 30]];
    for (const a of sorted) {
      for (const v of [-1, 0, 2, 5, 20, 25, 31]) {
        expect(sortedIndex(a, v), `sortedIndex([${a.join()}], ${v})`).toBe(
          lodash.sortedIndex(a, v),
        );
      }
    }
  });

  it("groupBy/countBy/shuffle over representative inputs", async () => {
    const lodash = {
      groupBy: (await import("lodash/groupBy")).default,
      countBy: (await import("lodash/countBy")).default,
    };

    const codes = [7, 3, 7, null, 3, 7, null, 12];
    expect(groupBy(codes)).toEqual(lodash.groupBy(codes));

    const rows = [
      { label: "a", value: 1 },
      { label: "b", value: 2 },
      { label: "a", value: 3 },
    ];
    expect(groupBy(rows, ({ label }) => label)).toEqual(
      lodash.groupBy(rows, ({ label }) => label),
    );
    expect(countBy(rows, (r) => r.label)).toEqual(
      lodash.countBy(rows, (r) => r.label),
    );

    const input = ["x", "y", "z", "w"];
    const shuffled = shuffle(input);
    expect(shuffled).toHaveLength(input.length);
    expect([...shuffled].sort()).toEqual([...input].sort());
    expect(input).toEqual(["x", "y", "z", "w"]); // input untouched
  });
});
