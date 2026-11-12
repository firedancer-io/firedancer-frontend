import { Flex } from "@radix-ui/themes";
import { DateTime } from "luxon";
import { memo, useMemo } from "react";
import { useMeasure } from "react-use";
import clsx from "clsx";
import { nsPerMs } from "../../consts";
import { msToNs } from "../../numUtils";
import { useAtomValue } from "jotai";
import {
  isLiveAtom,
  isPlayingAtom,
  miniMapPopoverBoundaryWidthAtom,
  playbackRateAtom,
  referenceNsAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "./atoms";
import { calcAbsoluteNs } from "./utils";
import { replayLiveTextColor } from "../../colors";
import { PauseIcon, PlayIcon } from "./controlIcons";
import styles from "./replay.module.css";
import {
  chooseLayout,
  formatRanges,
  type Range,
} from "./visibleRangeInfoUtils";

const MIN_BEHIND_TEXT_WIDTH_PX = 40;
const GAP_PX = 6;

const DURATION_UNITS: [label: string, ns: bigint][] = [
  ["mo", 2_592_000_000_000_000n],
  ["d", 86_400_000_000_000n],
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

function RangeText({ range }: { range: Range }) {
  return (
    <>
      <span className={styles.dateText}>{range.startDay} </span>
      <span className={styles.timeText}>{range.startTime} - </span>
      {range.endDay && <span className={styles.dateText}>{range.endDay} </span>}
      <span className={styles.timeText}>{range.endTime}</span>
    </>
  );
}

const toDateTime = (referenceNs: bigint, relativeMs: number) =>
  DateTime.fromMillis(
    Number(calcAbsoluteNs(referenceNs, relativeMs) / BigInt(nsPerMs)),
  );

const LiveIcon = memo(function LiveIcon() {
  return (
    <svg
      className={styles.liveIcon}
      xmlns="http://www.w3.org/2000/svg"
      width="6"
      height="6"
      viewBox="0 0 6 6"
      fill="none"
    >
      <circle cx="3" cy="3" r="3" fill={replayLiveTextColor} />
    </svg>
  );
});

export default memo(function VisibleRangeInfo() {
  const visibleRange = useAtomValue(visibleRangeAtom);
  const referenceNs = useAtomValue(referenceNsAtom);
  const worldRange = useAtomValue(worldRangeAtom);
  const isLive = useAtomValue(isLiveAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const playbackRate = useAtomValue(playbackRateAtom);
  const boundaryWidth = useAtomValue(miniMapPopoverBoundaryWidthAtom);

  const start = visibleRange?.[0];
  const end = visibleRange?.[1];
  const worldEnd = worldRange?.[1];

  const [popoverRef, { width: popoverWidth }] = useMeasure<HTMLDivElement>();
  const [statusTextRef, { width: statusTextWidth }] =
    useMeasure<HTMLSpanElement>();
  const [fullStatusTextRef, { width: fullStatusTextWidth }] =
    useMeasure<HTMLSpanElement>();
  const [rangeRef, { width: rangeWidth }] = useMeasure<HTMLSpanElement>();
  const [yearRangeRef, { width: yearRangeWidth }] =
    useMeasure<HTMLSpanElement>();
  const [secondsRangeRef, { width: secondsRangeWidth }] =
    useMeasure<HTMLSpanElement>();
  const [minutesRangeRef, { width: minutesRangeWidth }] =
    useMeasure<HTMLSpanElement>();

  const layout = chooseLayout({
    boundaryWidth,
    baseWidth:
      popoverWidth - (statusTextWidth && statusTextWidth + GAP_PX) - rangeWidth,
    statusWidth: fullStatusTextWidth,
    statusMinWidth: isLive
      ? fullStatusTextWidth
      : Math.min(fullStatusTextWidth, MIN_BEHIND_TEXT_WIDTH_PX),
    gap: GAP_PX,
    rangeWidths: {
      year: yearRangeWidth,
      seconds: secondsRangeWidth,
      minutes: minutesRangeWidth,
    },
    canShowHours: start != null && end != null && end - start >= 3_600_000,
  });

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

  const statusText = isLive
    ? "Live"
    : isPlaying
      ? `${playbackRate}× · ${behindText}`
      : behindText;
  const statusClassName = isLive ? styles.liveText : styles.behindText;

  const ranges = useMemo(
    () => dateTimes && formatRanges(...dateTimes, DateTime.now()),
    [dateTimes],
  );

  return (
    <div className={styles.popoverClip}>
      <div ref={popoverRef} className={styles.popoverContent}>
        <Flex
          className={styles.visibleRangeInfo}
          align="center"
          gap={`${GAP_PX}px`}
        >
          {isLive ? (
            <LiveIcon />
          ) : isPlaying ? (
            <PlayIcon className={styles.playbackIcon} />
          ) : (
            <PauseIcon className={styles.playbackIcon} />
          )}
          <span
            ref={statusTextRef}
            className={statusClassName}
            style={{ maxWidth: layout.statusMaxWidth }}
            hidden={!layout.showStatusText}
          >
            {statusText}
          </span>
          <span
            ref={fullStatusTextRef}
            className={clsx(statusClassName, styles.measure)}
          >
            {statusText}
          </span>
          <div className={styles.divider} />
          <span className={styles.windowSizeText}>{windowSizeText}</span>
          <div className={styles.divider} />
          {ranges && (
            <>
              <span ref={rangeRef}>
                <RangeText range={ranges[layout.range]} />
              </span>
              <span ref={yearRangeRef} className={styles.measure}>
                <RangeText range={ranges.year} />
              </span>
              <span ref={secondsRangeRef} className={styles.measure}>
                <RangeText range={ranges.seconds} />
              </span>
              <span ref={minutesRangeRef} className={styles.measure}>
                <RangeText range={ranges.minutes} />
              </span>
            </>
          )}
        </Flex>
      </div>
    </div>
  );
});
