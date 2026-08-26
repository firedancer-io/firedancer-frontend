import { expect, describe, it } from "vitest";
import { DateTime as LuxonDateTime, Duration as LuxonDuration } from "luxon";
import { DateTime, Duration } from "../timeUtils";

// vitest env pins TZ=America/Chicago (vite.config.ts); DST edges below are
// for that zone. 2026: spring forward Mar 8 02:00 CST, fall back Nov 1
// 02:00 CDT.

const unitNames = [
  "years",
  "quarters",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds",
] as const;

function durationUnits(d: Duration | LuxonDuration) {
  return Object.fromEntries(unitNames.map((u) => [u, d[u]]));
}

const msMatrix = [
  0,
  1,
  999,
  1000,
  1001,
  59_999,
  60_000,
  61_000,
  3_599_999,
  3_600_000,
  3_661_000,
  86_399_999,
  86_400_000,
  90_000_000,
  86_400_000 * 2 + 3_600_000 * 3,
  86_400_000 * 7,
  86_400_000 * 13 + 1234,
  86_400_000 * 28,
  86_400_000 * 30,
  86_400_000 * 100,
  86_400_000 * 364,
  86_400_000 * 365,
  86_400_000 * 400,
  12_345_678_901,
  1000.5,
  -1,
  -999,
  -90_500,
  -86_400_000 * 3 - 7_200_000,
];

describe("Duration matches luxon", () => {
  it("fromMillis().rescale() unit-for-unit", () => {
    for (const ms of msMatrix) {
      expect(
        durationUnits(Duration.fromMillis(ms).rescale()),
        `rescale(${ms})`,
      ).toEqual(durationUnits(LuxonDuration.fromMillis(ms).rescale()));
    }
  });

  it("fromObject({seconds}).rescale() unit-for-unit", () => {
    for (const seconds of [
      0,
      1,
      59,
      60,
      61,
      3599,
      3600,
      3700,
      90061,
      86400 * 40,
      0.5,
      90.5,
    ]) {
      expect(
        durationUnits(Duration.fromObject({ seconds }).rescale()),
        `rescale({seconds: ${seconds}})`,
      ).toEqual(durationUnits(LuxonDuration.fromObject({ seconds }).rescale()));
    }
  });

  it("toMillis() on raw and rescaled durations", () => {
    for (const ms of msMatrix) {
      expect(Duration.fromMillis(ms).toMillis()).toBe(
        LuxonDuration.fromMillis(ms).toMillis(),
      );
      expect(
        Duration.fromMillis(ms).rescale().toMillis(),
        `rescaled toMillis(${ms})`,
      ).toBe(LuxonDuration.fromMillis(ms).rescale().toMillis());
    }
  });

  it("toMillis() on multi-unit fromObject (casual matrix)", () => {
    const objects = [
      {
        years: 1,
        months: 2,
        weeks: 3,
        days: 20,
        hours: 13,
        minutes: 4,
        seconds: 52,
      },
      { millisecond: 999 },
      { days: 1, hours: 25 },
    ];
    for (const obj of objects) {
      expect(Duration.fromObject(obj).toMillis(), JSON.stringify(obj)).toBe(
        LuxonDuration.fromObject(obj).toMillis(),
      );
    }
  });

  it("as('minutes') on diff-style durations", () => {
    for (const ms of [0, 123_456, 60_000 * 5.5, 3_600_000 * 26, -60_000]) {
      expect(Duration.fromMillis(ms).as("minutes")).toBe(
        LuxonDuration.fromMillis(ms).as("minutes"),
      );
    }
  });
});

const instantMatrix = [
  Date.UTC(2026, 7, 26, 14, 30, 45, 123),
  Date.UTC(2026, 0, 15, 3, 4, 5, 6),
  Date.UTC(2026, 2, 8, 7, 59, 59, 999), // 01:59:59.999 CST, pre spring-forward
  Date.UTC(2026, 2, 8, 8, 0, 0, 0), // 03:00 CDT, post spring-forward
  Date.UTC(2026, 10, 1, 6, 30, 0, 0), // 01:30 CDT, first pass (ambiguous hour)
  Date.UTC(2026, 10, 1, 7, 30, 0, 0), // 01:30 CST, second pass
  Date.UTC(2026, 11, 31, 23, 59, 59, 500),
  0,
];

describe("DateTime matches luxon", () => {
  it("toISO({ includeOffset: false })", () => {
    for (const ms of instantMatrix) {
      expect(
        DateTime.fromMillis(ms).toISO({ includeOffset: false }),
        `toISO(${ms})`,
      ).toBe(LuxonDateTime.fromMillis(ms).toISO({ includeOffset: false }));
    }
  });

  it("toLocaleString with the app's formats", () => {
    const { year: _year, ...rest } = DateTime.DATETIME_MED_WITH_SECONDS;
    const appFormat = { ...rest, timeZoneName: "short" as const };
    for (const ms of instantMatrix) {
      expect(
        DateTime.fromMillis(ms).toLocaleString(appFormat),
        `toLocaleString(${ms})`,
      ).toBe(LuxonDateTime.fromMillis(ms).toLocaleString(appFormat));
    }
  });

  it("DATETIME_MED_WITH_SECONDS preset matches", () => {
    expect(DateTime.DATETIME_MED_WITH_SECONDS).toEqual(
      LuxonDateTime.DATETIME_MED_WITH_SECONDS,
    );
  });

  it("diff().rescale() and comparisons", () => {
    const pairs: [number, number][] = [
      [1_756_215_000_000, 1_756_214_000_000],
      [1_756_215_000_000, 1_756_215_000_000],
      [1_756_214_000_000, 1_756_215_000_000],
      [Date.UTC(2026, 10, 2), Date.UTC(2026, 10, 0)], // across fall-back
    ];
    for (const [a, b] of pairs) {
      const mine = DateTime.fromMillis(a).diff(DateTime.fromMillis(b));
      const theirs = LuxonDateTime.fromMillis(a).diff(
        LuxonDateTime.fromMillis(b),
      );
      expect(mine.toMillis()).toBe(theirs.toMillis());
      expect(durationUnits(mine.rescale())).toEqual(
        durationUnits(theirs.rescale()),
      );
      expect(DateTime.fromMillis(a) >= DateTime.fromMillis(b)).toBe(
        LuxonDateTime.fromMillis(a) >= LuxonDateTime.fromMillis(b),
      );
    }
  });

  it("toSeconds/toMillis", () => {
    for (const ms of instantMatrix) {
      expect(DateTime.fromMillis(ms).toSeconds()).toBe(
        LuxonDateTime.fromMillis(ms).toSeconds(),
      );
      expect(DateTime.fromMillis(ms).toMillis()).toBe(
        LuxonDateTime.fromMillis(ms).toMillis(),
      );
    }
  });

  it("now() agrees with luxon within tolerance", () => {
    expect(
      Math.abs(DateTime.now().toMillis() - LuxonDateTime.now().toMillis()),
    ).toBeLessThan(100);
  });

  it("plus(rescaled duration), including DST edges", () => {
    const durationsMs = [
      0,
      1_000,
      400 * 90, // one leader rotation at 400ms slots
      3_600_000,
      3 * 3_600_000,
      86_400_000, // 1 day: calendar math
      86_400_000 + 3_600_000 * 5 + 60_000 * 7 + 1_234,
      86_400_000 * 2,
      86_400_000 * 9, // week + days
      86_400_000 * 45, // months involved
      86_400_000 * 400, // years involved
    ];
    for (const base of instantMatrix) {
      for (const durMs of durationsMs) {
        const mine = DateTime.fromMillis(base).plus(
          Duration.fromMillis(durMs).rescale(),
        );
        const theirs = LuxonDateTime.fromMillis(base).plus(
          LuxonDuration.fromMillis(durMs).rescale(),
        );
        expect(mine.toMillis(), `plus(${durMs}) at ${base}`).toBe(
          theirs.toMillis(),
        );
      }
    }
  });

  it("plus lands in the spring-forward gap like luxon", () => {
    // 02:30 CST Mar 7 + 1 day targets nonexistent 02:30 Mar 8
    const base = Date.UTC(2026, 2, 7, 8, 30, 0);
    const mine = DateTime.fromMillis(base).plus(
      Duration.fromMillis(86_400_000).rescale(),
    );
    const theirs = LuxonDateTime.fromMillis(base).plus(
      LuxonDuration.fromMillis(86_400_000).rescale(),
    );
    expect(mine.toMillis()).toBe(theirs.toMillis());
  });

  it("plus with day units across the ambiguous fall-back hour", () => {
    // 01:30 CDT Oct 31 + 1 day targets ambiguous 01:30 Nov 1
    const base = Date.UTC(2026, 9, 31, 6, 30, 0);
    const mine = DateTime.fromMillis(base).plus(
      Duration.fromMillis(86_400_000).rescale(),
    );
    const theirs = LuxonDateTime.fromMillis(base).plus(
      LuxonDuration.fromMillis(86_400_000).rescale(),
    );
    expect(mine.toMillis()).toBe(theirs.toMillis());
  });
});
