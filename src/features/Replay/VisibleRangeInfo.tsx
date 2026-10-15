import { Flex } from "@radix-ui/themes";
import { DateTime } from "luxon";
import { memo, useMemo } from "react";
import { nsPerMs } from "../../consts";
import { msToNs } from "../../numUtils";
import { useAtomValue } from "jotai";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "./atoms";
import { calcAbsoluteNs } from "./utils";
import styles from "./replay.module.css";

/** Below this minimap width, drop the years from the date range to save space. */
const DROP_YEARS_WIDTH_PX = 480;

const DURATION_UNITS: [label: string, ns: bigint][] = [
  ["h", 3_600_000_000_000n],
  ["m", 60_000_000_000n],
  ["s", 1_000_000_000n],
  ["ms", 1_000_000n],
  ["µs", 1_000n],
  ["ns", 1n],
];

const formatWindowDuration = (
  durationNs: bigint,
  { maxSignificantUnits = 2, minUnitNs = 1n }: FormatDurationOptions = {},
) => {
  let remaining = durationNs < 0n ? -durationNs : durationNs;
  const parts: string[] = [];
  for (const [label, unitNs] of DURATION_UNITS) {
    if (unitNs < minUnitNs) break;
    const count = remaining / unitNs;
    if (count > 0n) parts.push(`${count}${label}`);
    remaining %= unitNs;
  }
  if (parts.length === 0) {
    const [label] = DURATION_UNITS.find(([, ns]) => ns === minUnitNs) ?? ["ns"];
    return `0${label}`;
  }
  return parts.slice(0, maxSignificantUnits).join(", ");
};

interface FormatDurationOptions {
  maxSignificantUnits?: number;
  minUnitNs?: bigint;
}

/**
 * Format a visible-window date range:
 * - same calendar day:   "Oct 11, 2026"
 * - same year:           "Oct 11 - Oct 13, 2026"
 * - different years:     "Oct 11 2025 - Oct 13 2026"
 *
 * When `dropYears` is set (not enough horizontal room), years are omitted:
 * - same calendar day:   "Oct 11"
 * - otherwise:           "Oct 11 - Oct 13"
 */
const formatDateRange = (
  startDt: DateTime,
  endDt: DateTime,
  dropYears = false,
) => {
  const startDay = startDt.toFormat("LLL d");
  const endDay = endDt.toFormat("LLL d");
  const startYear = startDt.toFormat("yyyy");
  const endYear = endDt.toFormat("yyyy");

  if (startDt.hasSame(endDt, "day")) {
    return dropYears ? endDay : `${endDay}, ${endYear}`;
  }
  if (dropYears) {
    return `${startDay} - ${endDay}`;
  }
  if (startYear === endYear) {
    return `${startDay} - ${endDay}, ${endYear}`;
  }
  return `${startDay} ${startYear} - ${endDay} ${endYear}`;
};

/**
 * Format a visible-window time range:
 * - same meridiem: "11:49:01 - 11:49:21 AM"
 * - different meridiem: "11:49:01 PM - 11:49:21 AM"
 */
const formatTimeRange = (startDt: DateTime, endDt: DateTime) => {
  const startTime = startDt.toFormat("h:mm:ss");
  const endTime = endDt.toFormat("h:mm:ss");
  const startMeridiem = startDt.toFormat("a");
  const endMeridiem = endDt.toFormat("a");

  if (startMeridiem === endMeridiem) {
    return `${startTime} - ${endTime} ${endMeridiem}`;
  }
  return `${startTime} ${startMeridiem} - ${endTime} ${endMeridiem}`;
};

const toDateTime = (referenceNs: bigint, relativeMs: number) =>
  DateTime.fromMillis(
    Number(calcAbsoluteNs(referenceNs, relativeMs) / BigInt(nsPerMs)),
  );

function PauseIcon() {
  return (
    <div className={styles.pauseIcon}>
      <div className={styles.pauseIconBar} />
      <div className={styles.pauseIconBar} />
    </div>
  );
}

export default memo(function VisibleRangeInfo({ width }: { width: number }) {
  const visibleRange = useAtomValue(visibleRangeAtom);
  const referenceNs = useAtomValue(referenceNsAtom);
  const worldRange = useAtomValue(worldRangeAtom);

  const start = visibleRange?.[0];
  const end = visibleRange?.[1];
  const worldEnd = worldRange?.[1];

  const behindText = useMemo(() => {
    if (end == null || worldEnd == null) return;
    const behind = formatWindowDuration(msToNs(worldEnd - end), {
      minUnitNs: 1_000_000_000n,
    });
    return `${behind} behind`;
  }, [end, worldEnd]);

  const windowSizeText = useMemo(() => {
    if (start == null || end == null) return;
    return formatWindowDuration(msToNs(end - start));
  }, [start, end]);

  const dateTimes = useMemo(() => {
    if (start == null || end == null || referenceNs == null) return;
    return [
      toDateTime(referenceNs, start),
      toDateTime(referenceNs, end),
    ] as const;
  }, [start, end, referenceNs]);

  const dateRangeText = useMemo(() => {
    if (!dateTimes) return;
    return formatDateRange(
      dateTimes[0],
      dateTimes[1],
      width < DROP_YEARS_WIDTH_PX,
    );
  }, [dateTimes, width]);

  const timeRangeText = useMemo(() => {
    if (!dateTimes) return;
    return formatTimeRange(dateTimes[0], dateTimes[1]);
  }, [dateTimes]);

  return (
    <Flex height="100%" align="center" gap="6px">
      <PauseIcon />
      <span className={styles.behindText}>{behindText}</span>
      <div className={styles.divider} />
      <span className={styles.windowSizeText}>{windowSizeText}</span>
      <div className={styles.divider} />
      <span className={styles.dateRangeText}>{dateRangeText}</span>
      <span className={styles.timeRangeText}>{timeRangeText}</span>
    </Flex>
  );
});
