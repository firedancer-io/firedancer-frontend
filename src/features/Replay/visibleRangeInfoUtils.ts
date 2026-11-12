import type { DateTime } from "luxon";

export interface Range {
  startDay: string;
  startTime: string;
  endDay?: string;
  endTime: string;
}

/**
 * Format a visible-window range at each precision the popover can show:
 * - same calendar day: "Oct 11 11:49:01 - 11:49:21 AM"
 * - different days:    "Oct 11 11:49:01 PM - Oct 13 11:49:21 AM"
 *
 * The start meridiem is omitted only on the same day when it matches the end.
 * Years outside the current one are shown (in `year` the current one too),
 * once when shared:
 * - "Oct 11 11:49:01 PM - Oct 13, 2025 11:49:21 AM"
 * - "Dec 31, 2025 11:59:59 PM - Jan 1 12:00:09 AM"
 */
export function formatRanges(
  startDt: DateTime,
  endDt: DateTime,
  now: DateTime,
) {
  // field compares, hasSame is ~20µs a call
  const isSameYear = startDt.year === endDt.year;
  const isSameDay =
    isSameYear && startDt.month === endDt.month && startDt.day === endDt.day;
  const isStartPastYear = startDt.year !== now.year;
  const isEndPastYear = endDt.year !== now.year;
  const startMeridiem = startDt.toFormat("a");
  const endMeridiem = endDt.toFormat("a");
  const showStartMeridiem = !isSameDay || startMeridiem !== endMeridiem;
  const startDay = startDt.toFormat("LLL d");
  const endDay = endDt.toFormat("LLL d");

  const format = (timeFormat: string, showCurrentYear: boolean): Range => {
    const showStartYear =
      (showCurrentYear || isStartPastYear) && (isSameDay || !isSameYear);
    const showEndYear = showCurrentYear || isEndPastYear;
    const startTime = startDt.toFormat(timeFormat);
    return {
      startDay: showStartYear ? `${startDay}, ${startDt.year}` : startDay,
      startTime: showStartMeridiem
        ? `${startTime} ${startMeridiem}`
        : startTime,
      endDay: isSameDay
        ? undefined
        : showEndYear
          ? `${endDay}, ${endDt.year}`
          : endDay,
      endTime: `${endDt.toFormat(timeFormat)} ${endMeridiem}`,
    };
  };

  return {
    year: format("h:mm:ss", true),
    seconds: format("h:mm:ss", false),
    minutes: format("h:mm", false),
    hours: format("h", false),
  };
}

interface ChooseLayoutArgs {
  boundaryWidth: number;
  baseWidth: number;
  statusWidth: number;
  statusMinWidth: number;
  gap: number;
  rangeWidths: { year: number; seconds: number; minutes: number };
  canShowHours: boolean;
}

/**
 * Pick the most detailed layout that fits. As room runs out: drop the current
 * year, truncate then hide the status text, drop seconds, then drop minutes.
 * `statusMaxWidth` is the leftover room to truncate the behind text to.
 */
export function chooseLayout({
  boundaryWidth,
  baseWidth,
  statusWidth,
  statusMinWidth,
  gap,
  rangeWidths,
  canShowHours,
}: ChooseLayoutArgs) {
  if (!boundaryWidth) {
    return {
      showStatusText: true,
      range: "year",
      statusMaxWidth: undefined,
    } as const;
  }

  const layouts = [
    { range: "year", statusWidth },
    { range: "seconds", statusWidth: statusMinWidth },
    { range: "seconds", statusWidth: undefined },
    { range: "minutes", statusWidth: undefined },
  ] as const;
  const layout = layouts.find(
    (layout) =>
      baseWidth +
        rangeWidths[layout.range] +
        (layout.statusWidth == null ? 0 : gap + layout.statusWidth) <=
      boundaryWidth,
  );
  if (!layout) {
    return {
      showStatusText: false,
      range: canShowHours ? "hours" : "minutes",
      statusMaxWidth: undefined,
    } as const;
  }
  const showStatusText = layout.statusWidth != null;
  return {
    showStatusText,
    range: layout.range,
    statusMaxWidth: showStatusText
      ? boundaryWidth - baseWidth - rangeWidths[layout.range] - gap
      : undefined,
  };
}
