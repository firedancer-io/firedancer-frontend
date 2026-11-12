import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { chooseLayout, formatRanges } from "./visibleRangeInfoUtils";

const now = DateTime.fromISO("2026-11-11T12:00:00");
const format = (start: string, end: string) =>
  formatRanges(DateTime.fromISO(start), DateTime.fromISO(end), now);

describe("formatRanges", () => {
  it("collapses the date and meridiem on the same day", () => {
    const ranges = format("2026-10-11T11:49:01", "2026-10-11T11:49:21");
    expect(ranges.seconds).toEqual({
      startDay: "Oct 11",
      startTime: "11:49:01",
      endDay: undefined,
      endTime: "11:49:21 AM",
    });
    expect(ranges.minutes).toMatchObject({
      startTime: "11:49",
      endTime: "11:49 AM",
    });
    expect(ranges.hours).toMatchObject({ startTime: "11", endTime: "11 AM" });
  });

  it("shows both meridiems on the same day when they differ", () => {
    const ranges = format("2026-10-11T11:59:59", "2026-10-11T12:00:09");
    expect(ranges.seconds).toMatchObject({
      startTime: "11:59:59 AM",
      endTime: "12:00:09 PM",
    });
  });

  it("shows both dates and meridiems across days", () => {
    const ranges = format("2026-10-11T11:49:01", "2026-10-13T11:49:21");
    expect(ranges.seconds).toEqual({
      startDay: "Oct 11",
      startTime: "11:49:01 AM",
      endDay: "Oct 13",
      endTime: "11:49:21 AM",
    });
  });

  it("shows the current year only in the year range", () => {
    const ranges = format("2026-10-11T11:49:01", "2026-10-13T11:49:21");
    expect(ranges.year).toMatchObject({
      startDay: "Oct 11",
      endDay: "Oct 13, 2026",
    });
    const sameDay = format("2026-10-11T11:49:01", "2026-10-11T11:49:21");
    expect(sameDay.year.startDay).toBe("Oct 11, 2026");
  });

  it("shows a shared past year once, on the end date", () => {
    const ranges = format("2025-10-11T23:49:01", "2025-10-13T11:49:21");
    expect(ranges.seconds).toMatchObject({
      startDay: "Oct 11",
      endDay: "Oct 13, 2025",
    });
  });

  it("shows a past year on a same day range", () => {
    const ranges = format("2025-10-11T11:49:01", "2025-10-11T11:49:21");
    expect(ranges.seconds.startDay).toBe("Oct 11, 2025");
  });

  it("shows each year outside the current one across years", () => {
    const ranges = format("2025-12-31T23:59:59", "2026-01-01T00:00:09");
    expect(ranges.seconds).toEqual({
      startDay: "Dec 31, 2025",
      startTime: "11:59:59 PM",
      endDay: "Jan 1",
      endTime: "12:00:09 AM",
    });
    expect(ranges.year).toMatchObject({
      startDay: "Dec 31, 2025",
      endDay: "Jan 1, 2026",
    });
  });
});

describe("chooseLayout", () => {
  // needs: year 401, status + seconds 306, seconds 260, minutes 230
  const choose = (boundaryWidth: number, canShowHours = true) =>
    chooseLayout({
      boundaryWidth,
      baseWidth: 100,
      statusWidth: 95,
      statusMinWidth: 40,
      gap: 6,
      rangeWidths: { year: 200, seconds: 160, minutes: 130 },
      canShowHours,
    });

  it("shows everything before anything is measured", () => {
    expect(choose(0)).toEqual({
      showStatusText: true,
      range: "year",
      statusMaxWidth: undefined,
    });
  });

  it("shows the current year only with the full status text", () => {
    expect(choose(1000)).toEqual({
      showStatusText: true,
      range: "year",
      statusMaxWidth: 694,
    });
    expect(choose(401).statusMaxWidth).toBe(95);
  });

  it("drops the current year before truncating the status text", () => {
    expect(choose(400)).toEqual({
      showStatusText: true,
      range: "seconds",
      statusMaxWidth: 134,
    });
  });

  it("then truncates the status text to the leftover room", () => {
    expect(choose(320).statusMaxWidth).toBe(54);
    expect(choose(306).statusMaxWidth).toBe(40);
  });

  it("hides short status text only when it doesn't fit", () => {
    const short = chooseLayout({
      boundaryWidth: 291,
      baseWidth: 100,
      statusWidth: 25,
      statusMinWidth: 25,
      gap: 6,
      rangeWidths: { year: 200, seconds: 160, minutes: 130 },
      canShowHours: true,
    });
    expect(short.showStatusText).toBe(true);
  });

  it("then hides the status text", () => {
    expect(choose(305)).toEqual({
      showStatusText: false,
      range: "seconds",
      statusMaxWidth: undefined,
    });
  });

  it("then drops seconds", () => {
    expect(choose(259).range).toBe("minutes");
  });

  it("drops minutes only when allowed", () => {
    expect(choose(229).range).toBe("hours");
    expect(choose(229, false).range).toBe("minutes");
  });
});
