import { Flex, Grid, Text } from "@radix-ui/themes";
import { useSlotLanes } from "./useSlotLanes";
import clsx from "clsx";
import styles from "./slotLanes.module.css";
import { memo, useCallback, useRef, useState } from "react";
import Progress from "../../../components/Progress";
import useNextSlot from "../../../hooks/useNextSlot";
import { getGridColumnsAndGap } from "./utils";
import {
  defaultBarsGap,
  nextSlotsBarMinWidth,
  defaultNextSlotsBarsCount,
  nextBarsBoxMinWidth,
} from "./const";
import { useAtomValue } from "jotai";
import { epochAtom } from "../../../atoms";
import { nsPerMs } from "../../../consts";

/**
 * Element width, measured synchronously on attach (the setState lands
 * before the mount paint) and via ResizeObserver afterwards; useMeasure
 * delivers even the first size a frame late, so bar geometry sized from
 * it would paint at the default width and visibly snap.
 */
function useMeasuredWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    observerRef.current = new ResizeObserver((entries) => {
      if (entries[0]) setWidth(entries[0].contentRect.width);
    });
    observerRef.current.observe(el);
  }, []);
  return [ref, width];
}

export default function SlotLanes() {
  const [measureRef, barsContainerWidth] = useMeasuredWidth();
  const { lanes, leftRange } = useSlotLanes();

  if (leftRange == null) return null;

  const leftBarsCount = leftRange.maxSlot - leftRange.minSlot + 1;
  const nextLeaderLane = lanes.find((lane) => lane.isNextLeader);
  const hasNextLeader = nextLeaderLane?.slot != null;
  const totalSlotCellsCount = leftBarsCount + (hasNextLeader ? 1 : 0);

  const nextSlotsCount =
    nextLeaderLane?.slot == null
      ? undefined
      : // always show at least one bar
        Math.max(1, nextLeaderLane.slot - leftRange.maxSlot - 1);

  const { columns, barsGap } = getGridColumnsAndGap(
    leftBarsCount,
    hasNextLeader,
    barsContainerWidth,
  );

  return (
    <Flex>
      <Grid
        className={styles.grid}
        flexShrink="0"
        columns="repeat(3, max-content)"
        gapX="5px"
        mr="5px"
      >
        {lanes.map((lane) => {
          const slot =
            lane.isNextLeader && !hasNextLeader ? Infinity : lane.slot;
          return (
            <SlotLaneStats
              key={lane.label}
              label={lane.label}
              slot={slot}
              slotDt={lane.slotDt}
              showPinIcon={!!lane.isPinned}
              showPlusSign={!lane.isNextLeader}
              className={lane.className}
            />
          );
        })}
      </Grid>

      <Grid
        className={styles.grid}
        flexGrow="1"
        columns={columns}
        gapX={`${barsGap}px`}
        ref={measureRef}
      >
        <div
          style={{
            gridColumn: leftBarsCount + 1,
            gridRowStart: 1,
            gridRowEnd: lanes.length + 1,
          }}
        >
          <MNextSlots count={nextSlotsCount} />
        </div>

        {lanes.map((lane) => {
          const highlightedIdx =
            lane.slot == null
              ? undefined
              : lane.isNextLeader && hasNextLeader
                ? // highlight last column
                  totalSlotCellsCount - 1
                : lane.slot - leftRange.minSlot;

          return (
            <MSlotLaneBars
              key={lane.label}
              className={lane.className}
              totalBarsCount={totalSlotCellsCount}
              highlightedIdx={highlightedIdx}
              noGap={barsGap === 0}
            />
          );
        })}
      </Grid>
    </Flex>
  );
}

interface CellProps {
  isTransparent: boolean;
  isHighlighted: boolean;
}
const MCell = memo(function Cell({ isHighlighted, isTransparent }: CellProps) {
  return (
    <div
      className={clsx(styles.slotCell, { [styles.transparent]: isTransparent })}
    >
      {isHighlighted && <div className={styles.highlight}></div>}
    </div>
  );
});

interface SlotLaneStatsProps {
  label: string;
  slot: number | null | undefined;
  slotDt: number | null | undefined;
  showPinIcon: boolean;
  showPlusSign: boolean;
  className: string;
}
function SlotLaneStats({
  label,
  slot,
  slotDt,
  showPinIcon,
  showPlusSign,
  className,
}: SlotLaneStatsProps) {
  const dtText = showPinIcon
    ? "\u{1F4CD}"
    : slotDt == null
      ? undefined
      : showPlusSign && slotDt > 0
        ? `+${slotDt}`
        : slotDt;

  return (
    <div className={clsx(styles.slotLaneStats, className)}>
      <Text>{label}</Text>

      <Text align="right" ml="4px" className={styles.slotDt}>
        {" "}
        {dtText}
      </Text>

      <Text align="right" mx="4px" className={styles.slotText}>
        {" "}
        {slot === Infinity ? "∞" : slot}
      </Text>
    </div>
  );
}

interface SlotLaneBarsProps {
  className: string;
  totalBarsCount: number;
  highlightedIdx?: number;
  noGap: boolean;
}

const MSlotLaneBars = memo(function SlotLaneBars({
  className,
  totalBarsCount,
  highlightedIdx,
  noGap,
}: SlotLaneBarsProps) {
  return (
    <Flex className={clsx(styles.slotLaneBars, className)}>
      {Array.from({ length: totalBarsCount }, (_, i) => {
        return (
          <MCell
            key={i}
            isHighlighted={i === highlightedIdx}
            isTransparent={noGap}
          />
        );
      })}
    </Flex>
  );
});

interface NextSlotsProps {
  count?: number;
}

const MNextSlots = memo(function NextSlots({ count }: NextSlotsProps) {
  const [measureRef, width] = useMeasuredWidth();
  const maxBars = Math.trunc(
    (width + defaultBarsGap) / (nextSlotsBarMinWidth + defaultBarsGap),
  );
  const barsCount = Math.min(count ?? defaultNextSlotsBarsCount, maxBars);

  return (
    <Flex
      ref={measureRef}
      width="100%"
      height="100%"
      gap={`${defaultBarsGap}px`}
      position="relative"
    >
      {Array.from({ length: barsCount }, (_, i) => {
        return <div key={i} className={styles.nextSlot} />;
      })}
      <NextLeaderTimer isNarrow={width <= nextBarsBoxMinWidth + 10} />
    </Flex>
  );
});

interface NextLeaderTimerProps {
  isNarrow: boolean;
}
function NextLeaderTimer({ isNarrow }: NextLeaderTimerProps) {
  const { progressSinceLastLeader, nextSlotText, nextLeaderSlot } = useNextSlot(
    {
      showNowIfCurrent: false,
      durationOptions: {
        showOnlyTwoSignificantUnits: true,
      },
    },
  );

  const showInfinity = nextLeaderSlot == null;

  const targetSlotDurationNs =
    useAtomValue(epochAtom)?.target_slot_duration_nanos ?? 400 * nsPerMs;
  // a bit longer than an expected slot duration
  const progressDuration = (targetSlotDurationNs / nsPerMs) * 1.25;

  return (
    <Flex
      position="absolute"
      maxWidth="100%"
      minWidth={`${nextBarsBoxMinWidth}px`}
      direction="column"
      p="5px"
      align="stretch"
      justify="between"
      className={styles.nextLeaderTimerContainer}
    >
      <Flex justify="center">
        {(showInfinity || !isNarrow) && (
          <Text className={styles.nextLeaderTimerLabel} truncate>
            Time Until Leader&nbsp;
          </Text>
        )}

        <Text className={styles.nextLeaderTime} truncate dir="rtl">
          {showInfinity ? "∞" : nextSlotText}
        </Text>
      </Flex>
      <div>
        <Progress
          value={progressSinceLastLeader}
          height="1px"
          duration={`${progressDuration}ms`}
        />
      </div>
    </Flex>
  );
}
