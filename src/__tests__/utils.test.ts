import { expect, describe, it } from "vitest";
import {
  formatSIBytes,
  formatTimeNanos,
  getDiscountedVoteLatency,
  getDurationText,
  getEpochStake,
  getEpochStakes,
  getLeaderSlots,
  hasLateVote,
} from "../utils";
import { Duration } from "luxon";
import type { Epoch, SlotPublish } from "../api/types";

function makeEpoch(overrides: Partial<Epoch> = {}): Epoch {
  return {
    epoch: 1,
    start_slot: 100,
    end_slot: 199,
    start_time_nanos: null,
    end_time_nanos: null,
    staked_pubkeys: ["a"],
    staked_lamports: [10n],
    excluded_stake_lamports: 0n,
    leader_slots: [],
    ...overrides,
  };
}

describe("getEpochStakes", () => {
  it("sums lamports and excluded stake exactly beyond safe number precision", () => {
    const epoch = makeEpoch({
      staked_pubkeys: ["a", "b"],
      staked_lamports: [9_007_199_254_740_993n, 9_007_199_254_740_995n],
      excluded_stake_lamports: 9_007_199_254_740_997n,
    });

    expect(getEpochStakes(epoch)).toEqual({
      stakeByIdentity: new Map([
        ["a", 9_007_199_254_740_993n],
        ["b", 9_007_199_254_740_995n],
      ]),
      totalStake: 27_021_597_764_222_985n,
      excludedStake: 9_007_199_254_740_997n,
      knownStakedValidatorCount: 2,
    });
  });

  it("aggregates duplicate identities without changing leader schedule arrays", () => {
    const epoch = makeEpoch({
      staked_pubkeys: ["b", "a", "b", "zero", "a"],
      staked_lamports: [3n, 0n, 7n, 0n, 5n],
      leader_slots: [2, 1, 0, 3],
    });
    Object.freeze(epoch.staked_pubkeys);
    Object.freeze(epoch.staked_lamports);
    Object.freeze(epoch.leader_slots);

    expect(getEpochStakes(epoch)).toEqual({
      stakeByIdentity: new Map([
        ["b", 10n],
        ["a", 5n],
        ["zero", 0n],
      ]),
      totalStake: 15n,
      excludedStake: 0n,
      knownStakedValidatorCount: 2,
    });
    expect(epoch.staked_pubkeys).toEqual(["b", "a", "b", "zero", "a"]);
    expect(epoch.staked_lamports).toEqual([3n, 0n, 7n, 0n, 5n]);
    expect(epoch.leader_slots).toEqual([2, 1, 0, 3]);
    expect(getLeaderSlots(epoch, "b")).toEqual([100, 108]);
    expect(getLeaderSlots(epoch, "a")).toEqual([104]);
  });

  it.each([0n, 17n])(
    "supports empty arrays with %s excluded stake",
    (excludedStake) => {
      expect(
        getEpochStakes(
          makeEpoch({
            staked_pubkeys: [],
            staked_lamports: [],
            excluded_stake_lamports: excludedStake,
          }),
        ),
      ).toEqual({
        stakeByIdentity: new Map(),
        totalStake: excludedStake,
        excludedStake,
        knownStakedValidatorCount: 0,
      });
    },
  );

  it.each([
    ["too few amounts", { staked_lamports: [] }],
    ["too many amounts", { staked_lamports: [10n, 20n] }],
    ["negative amount", { staked_lamports: [-1n] }],
    [
      "negative duplicate amount",
      { staked_pubkeys: ["a", "a"], staked_lamports: [10n, -1n] },
    ],
    ["negative excluded amount", { excluded_stake_lamports: -1n }],
    ["number amount", { staked_lamports: [10] }],
    ["number excluded amount", { excluded_stake_lamports: 0 }],
    ["missing amounts", { staked_lamports: undefined }],
    ["missing identities", { staked_pubkeys: undefined }],
    ["missing excluded amount", { excluded_stake_lamports: undefined }],
    ["invalid identity", { staked_pubkeys: [null] }],
    ["missing array entry", { staked_lamports: [undefined] }],
  ])(
    "returns unknown for %s instead of partial stake data",
    (_name, overrides) => {
      const epoch = { ...makeEpoch(), ...overrides } as unknown as Epoch;
      expect(getEpochStakes(epoch)).toBeUndefined();
    },
  );
});

describe("getEpochStake", () => {
  it("returns unknown without epoch stakes or an identity", () => {
    expect(getEpochStake(undefined, "a")).toBeUndefined();
    expect(
      getEpochStake(getEpochStakes(makeEpoch()), undefined),
    ).toBeUndefined();
  });

  it.each([0n, 20n])(
    "preserves mapped positive and zero stakes with %s excluded",
    (excludedStake) => {
      const stakes = getEpochStakes(
        makeEpoch({
          staked_pubkeys: ["a", "zero"],
          staked_lamports: [10n, 0n],
          excluded_stake_lamports: excludedStake,
        }),
      );
      expect(getEpochStake(stakes, "a")).toBe(10n);
      expect(getEpochStake(stakes, "zero")).toBe(0n);
      expect(getEpochStake(stakes, "missing")).toBe(
        excludedStake === 0n ? 0n : undefined,
      );
    },
  );
});

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
