import { expect, describe, it } from "vitest";
import { formatTimeNanos, getDurationText } from "../utils";
import { Duration } from "luxon";

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
  it("formats millis and nanos correctly", () => {
    expect(formatTimeNanos(1764892025356640223n)).toEqual({
      inMillis: "Dec 4, 11:47:05.356 PM UTC",
      inNanos: "Dec 4, 11:47:05.356640223 PM UTC",
    });
  });

  it("zero prefixes nanos correctly", () => {
    expect(formatTimeNanos(1764921600000000123n)).toEqual({
      inMillis: "Dec 5, 8:00:00.000 AM UTC",
      inNanos: "Dec 5, 8:00:00.000000123 AM UTC",
    });
  });
});
