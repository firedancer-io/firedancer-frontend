import { Box, Flex, Grid, Text } from "@radix-ui/themes";
import { useSlotLanes } from "./useSlotLanes";
import clsx from "clsx";
import styles from "./slotLanes.module.css";
import { memo } from "react";
import { useMeasure } from "react-use";
import Progress from "../../../components/Progress";
import useNextSlot from "../../../hooks/useNextSlot";
import { getCellsGap } from "./utils";
import { slotCellMinWidth } from "./const";
import { useAtomValue } from "jotai";
import { epochAtom } from "../../../atoms";
import { nsPerMs } from "../../../consts";
import { headerGap } from "../../Gossip/consts";
import type { SlotLaneInfo } from "./types";

export default function SlotLanes() {
  const { lanes, slotRange, nextLeaderInfo } = useSlotLanes();
  return (
    <Flex direction="column" height="100%" gap={headerGap}>
      <Flex justify="between" gap="4px">
        <Text className={styles.cardHeader}>Slots</Text>
        <NextLeaderInfo {...nextLeaderInfo} />
      </Flex>

      {slotRange != null && (
        <Flex>
          <Grid
            className={styles.grid}
            flexShrink="0"
            columns="repeat(3, max-content)"
            gapX="5px"
            mr="5px"
          >
            {lanes.map((lane) => {
              return (
                <SlotLaneStats
                  key={lane.label}
                  label={lane.label}
                  slot={lane.slot}
                  slotDt={lane.slotDt}
                  showPinIcon={!!lane.isPinned}
                  className={lane.className}
                />
              );
            })}
          </Grid>
          <CellsGrid lanes={lanes} slotRange={slotRange} />
        </Flex>
      )}
    </Flex>
  );
}

interface CellsGridProps {
  lanes: SlotLaneInfo[];
  slotRange: {
    minSlot: number;
    maxSlot: number;
  };
}

function CellsGrid({ lanes, slotRange }: CellsGridProps) {
  const [measureRef, { width: cellsContainerWidth }] =
    useMeasure<HTMLDivElement>();

  const slotsCount = slotRange.maxSlot - slotRange.minSlot + 1;
  const cellsGap = getCellsGap(slotsCount, cellsContainerWidth);

  return (
    <Grid
      className={styles.grid}
      flexGrow="1"
      columns={cellsGap ? `repeat(${slotsCount}, 1fr)` : "1fr"}
      gapX={`${cellsGap}px`}
      overflow="hidden"
      ref={measureRef}
    >
      {lanes.map((lane) => {
        const key = lane.label;
        const highlightedIdx =
          lane.slot == null ? undefined : lane.slot - slotRange.minSlot;

        if (cellsGap) {
          return (
            <MSlotLaneCells
              key={key}
              className={lane.className}
              cellsCount={slotsCount}
              highlightedIdx={highlightedIdx}
            />
          );
        }

        // too many cells; only render the highlighted cell
        const highlightPosition =
          highlightedIdx == null
            ? undefined
            : ((highlightedIdx + slotCellMinWidth / 2) / slotsCount) * 100;

        return (
          <Box
            key={key}
            position="relative"
            className={clsx(styles.onlyHighlightRow, lane.className)}
          >
            <Box position="absolute" inset="0" className={styles.slotCell} />

            {highlightPosition != null && (
              <Box
                position="relative"
                height="100%"
                className={styles.highlightPositioner}
                style={{ transform: `translateX(${highlightPosition}%)` }}
              >
                <Box
                  position="absolute"
                  top="0"
                  bottom="0"
                  left="-0.5px"
                  width="1px"
                  className={clsx(styles.slotCell, styles.highlighted)}
                />
              </Box>
            )}
          </Box>
        );
      })}
    </Grid>
  );
}

interface CellProps {
  isHighlighted: boolean;
}
const MCell = memo(function Cell({ isHighlighted }: CellProps) {
  return (
    <div
      className={clsx(styles.slotCell, { [styles.highlighted]: isHighlighted })}
    />
  );
});

interface SlotLaneStatsProps {
  label: string;
  slot: number | null | undefined;
  slotDt: number | null | undefined;
  showPinIcon: boolean;
  className?: string;
}
function SlotLaneStats({
  label,
  slot,
  slotDt,
  showPinIcon,
  className,
}: SlotLaneStatsProps) {
  const dtText = showPinIcon
    ? "\u{1F4CD}"
    : slotDt == null
      ? undefined
      : slotDt > 0
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
        {slot}
      </Text>
    </div>
  );
}

interface SlotLaneCellsProps {
  className?: string;
  cellsCount: number;
  highlightedIdx?: number;
}

const MSlotLaneCells = memo(function SlotLaneCells({
  className,
  cellsCount,
  highlightedIdx,
}: SlotLaneCellsProps) {
  return (
    <Flex className={clsx(styles.slotLaneCells, className)}>
      {Array.from({ length: cellsCount }, (_, i) => {
        return <MCell key={i} isHighlighted={i === highlightedIdx} />;
      })}
    </Flex>
  );
});

function NextLeaderInfo({ label, slotDt, slot }: SlotLaneInfo) {
  return (
    <Flex
      gap="4px"
      align="center"
      justify="end"
      flexGrow="1"
      maxWidth="400px"
      className={styles.nextLeaderInfo}
    >
      <Text className={styles.label}>{label}</Text>

      {slotDt != null && (
        <Text className={styles.dt}>
          {slotDt > 0 ? "+" : ""}
          {slotDt}
        </Text>
      )}

      {slot == null ? (
        <Text className={styles.none}>none</Text>
      ) : (
        <Text className={styles.slot}>{slot}</Text>
      )}
      <NextLeaderCountdown />
    </Flex>
  );
}

function NextLeaderCountdown() {
  const { progressSinceLastLeader, nextSlotText, nextLeaderSlot } = useNextSlot(
    {
      showNowIfCurrent: false,
      durationOptions: {
        showOnlyTwoSignificantUnits: true,
      },
    },
  );

  const countdownText = nextLeaderSlot == null ? "∞s" : nextSlotText;

  const targetSlotDurationNs =
    useAtomValue(epochAtom)?.target_slot_duration_nanos ?? 400 * nsPerMs;
  // a bit longer than an expected slot duration
  const progressDuration = (targetSlotDurationNs / nsPerMs) * 1.25;

  return (
    <>
      <Progress
        className={styles.progressBar}
        value={progressSinceLastLeader}
        height="5px"
        duration={`${progressDuration}ms`}
      />
      <Text className={styles.countdown}>{countdownText}</Text>
    </>
  );
}
