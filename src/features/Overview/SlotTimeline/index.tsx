import { useAtomValue } from "jotai";
import {
  completedSlotAtom,
  finalizedSlotAtom,
  isAlpenglowAtom,
  optimisticallyConfirmedSlotAtom,
  repairSlotAtom,
  rootSlotAtom,
  storageSlotAtom,
  turbineSlotAtom,
  voteSlotAtom,
} from "../../../api/atoms";
import { nextLeaderSlotAtom } from "../../../atoms";
import { Flex, Text } from "@radix-ui/themes";
import { memo, useMemo, type CSSProperties } from "react";
import { useMeasure } from "react-use";
import Card from "../../../components/Card";
import { headerGap } from "../../Gossip/consts";
import styles from "./slotTimeline.module.css";
import clsx from "clsx";
import type { CurrentSlotRange, SlotLane } from "./types";
import {
  getCurrentSlotRange,
  getFutureSlotCellCount,
  shouldShowNextLeaderColumn,
  getSlotLanes,
} from "./utils";
import useNextSlot from "../../../hooks/useNextSlot";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import MonoText from "../../../components/MonoText";
import Progress from "../../../components/Progress";

const minSlotHeaderWidthPx = 72;

type TimelineGridStyle = CSSProperties & {
  "--lane-count": number;
};

type LaneStyle = CSSProperties & {
  "--lane-color": string;
};

export default function SlotTimeline() {
  const isStartupRunning = useAtomValue(showStartupProgressAtom);
  if (isStartupRunning) return;

  return (
    <Card>
      <Flex direction="column" height="100%" gap={headerGap}>
        <Text
          style={{
            color: "var(--primary-text-color)",
            fontSize: "18px",
          }}
        >
          Slots
        </Text>
        <SlotLanes />
      </Flex>
    </Card>
  );
}

function SlotLanes() {
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const storageSlot = useAtomValue(storageSlotAtom);
  const rootSlot = useAtomValue(rootSlotAtom);
  const voteSlot = useAtomValue(voteSlotAtom);
  const repairSlot = useAtomValue(repairSlotAtom);
  const turbineSlot = useAtomValue(turbineSlotAtom);
  const replaySlot = useAtomValue(completedSlotAtom);
  const optimisticallyConfirmedSlot = useAtomValue(
    optimisticallyConfirmedSlotAtom,
  );
  const finalizedSlot = useAtomValue(finalizedSlotAtom);
  const nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);

  const lanes = useMemo(
    () =>
      replaySlot == null
        ? []
        : getSlotLanes({
            isAlpenglow,
            nextLeaderSlot,
            turbineSlot,
            repairSlot,
            replaySlot,
            voteSlot,
            optimisticallyConfirmedSlot,
            rootSlot,
            finalizedSlot,
            storageSlot,
          }),
    [
      finalizedSlot,
      isAlpenglow,
      nextLeaderSlot,
      optimisticallyConfirmedSlot,
      repairSlot,
      replaySlot,
      rootSlot,
      storageSlot,
      turbineSlot,
      voteSlot,
    ],
  );

  const currentSlotRange = useMemo(
    () =>
      replaySlot == null ? undefined : getCurrentSlotRange(lanes, replaySlot),
    [lanes, replaySlot],
  );

  if (replaySlot == null || currentSlotRange == null) return;

  const nextLeaderLane = lanes.find(({ id }) => id === "nextLeader");
  const hasNextLeaderColumn = shouldShowNextLeaderColumn(
    nextLeaderLane?.slot,
    currentSlotRange.maxSlot,
  );
  const futureSlotCellCount = getFutureSlotCellCount(
    currentSlotRange.maxSlot,
    nextLeaderLane?.slot,
  );
  const hasFutureSection = futureSlotCellCount > 0;
  const futureSectionWeight = Math.min(
    currentSlotRange.slots.length,
    Math.max(3, futureSlotCellCount / 2),
  );
  const gridTemplateColumns = [
    "minmax(112px, max-content)",
    `minmax(240px, ${currentSlotRange.slots.length}fr)`,
    hasFutureSection ? `minmax(90px, ${futureSectionWeight}fr)` : undefined,
    hasNextLeaderColumn ? "minmax(68px, 1fr)" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const timelineStyle = {
    "--lane-count": lanes.length,
    gridTemplateColumns,
  } as TimelineGridStyle;

  return (
    <div className={styles.timelineViewport}>
      <div
        aria-label="Slot timeline"
        className={styles.timelineGrid}
        style={timelineStyle}
      >
        <LaneLabels lanes={lanes} referenceSlot={replaySlot} />
        <CurrentSlots lanes={lanes} range={currentSlotRange} />
        {hasFutureSection && (
          <FutureSlots lanes={lanes} cellCount={futureSlotCellCount} />
        )}
        {hasNextLeaderColumn && nextLeaderLane != null && (
          <NextLeaderSlots lanes={lanes} nextLeaderLane={nextLeaderLane} />
        )}
      </div>
    </div>
  );
}

interface LaneLabelsProps {
  lanes: SlotLane[];
  referenceSlot: number;
}

function LaneLabels({ lanes, referenceSlot }: LaneLabelsProps) {
  return (
    <div className={clsx(styles.timelineSection, styles.labelsSection)}>
      <Text className={styles.typeHeader}>Type</Text>
      {lanes.map((lane) => {
        const delta = lane.slot == null ? null : lane.slot - referenceSlot;
        const deltaText =
          delta == null
            ? "never"
            : lane.id === "nextLeader"
              ? `${delta}`
              : delta > 0
                ? `+${delta}`
                : `${delta}`;

        return (
          <div
            className={styles.laneLabel}
            key={lane.id}
            style={{ "--lane-color": lane.color } as LaneStyle}
            title={
              lane.slot == null
                ? `${lane.label}: never`
                : `${lane.label}: ${lane.slot}`
            }
          >
            <Text className={styles.laneName} weight="medium" truncate>
              {lane.label}
            </Text>
            {lane.isReference ? (
              <Text aria-label="Reference slot" className={styles.pin}>
                &#x1F4CD;
              </Text>
            ) : (
              <MonoText className={styles.laneDelta} weight="bold">
                {deltaText}
              </MonoText>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface CurrentSlotsProps {
  lanes: SlotLane[];
  range: CurrentSlotRange;
}

function CurrentSlots({ lanes, range }: CurrentSlotsProps) {
  const { minSlot, maxSlot, slots } = range;
  const columns = `repeat(${slots.length}, minmax(0, 1fr))`;

  return (
    <div className={styles.timelineSection}>
      <CurrentSlotHeaders slots={slots} columns={columns} />
      {lanes.map((lane) => (
        <SlotCells
          columns={columns}
          key={lane.id}
          lane={lane}
          minSlot={minSlot}
          maxSlot={maxSlot}
          slots={slots}
        />
      ))}
    </div>
  );
}

interface CurrentSlotHeadersProps {
  slots: number[];
  columns: string;
}

function CurrentSlotHeaders({ slots, columns }: CurrentSlotHeadersProps) {
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();
  const visibleLabelCount = Math.max(
    1,
    Math.floor(width / minSlotHeaderWidthPx),
  );
  const labelInterval = Math.max(
    1,
    Math.ceil(slots.length / visibleLabelCount),
  );

  return (
    <div
      className={styles.slotCells}
      ref={measureRef}
      style={{ gridTemplateColumns: columns }}
    >
      {slots.map((slot, index) => {
        const showLabel =
          index === 0 ||
          index === slots.length - 1 ||
          index % labelInterval === 0;

        return (
          <MonoText
            className={styles.slotHeaderCell}
            key={slot}
            title={`${slot}`}
          >
            {showLabel ? slot : null}
          </MonoText>
        );
      })}
    </div>
  );
}

interface SlotCellsProps {
  lane: SlotLane;
  slots: number[];
  minSlot: number;
  maxSlot: number;
  columns: string;
}

const SlotCells = memo(function SlotCells({
  lane,
  slots,
  minSlot,
  maxSlot,
  columns,
}: SlotCellsProps) {
  /* A lane with no slot has nothing to mark anywhere on the row; note
     that null < minSlot would otherwise be true, since null coerces to
     zero, and would clip a marker to the left edge. */
  const isBeforeRange = lane.slot != null && lane.slot < minSlot;
  const isAfterRange = lane.slot != null && lane.slot > maxSlot;
  const visibleSlot =
    lane.slot == null
      ? null
      : isBeforeRange
        ? minSlot
        : isAfterRange
          ? maxSlot
          : lane.slot;
  const showOutOfRangeMarker = lane.id !== "nextLeader";

  return (
    <div
      className={styles.slotCells}
      style={
        {
          "--lane-color": lane.color,
          gridTemplateColumns: columns,
        } as LaneStyle
      }
    >
      {slots.map((slot) => {
        const isMarker =
          visibleSlot != null &&
          slot === visibleSlot &&
          (!isBeforeRange && !isAfterRange ? true : showOutOfRangeMarker);

        return (
          <div
            aria-hidden="true"
            className={clsx(styles.slotCell, {
              [styles.activeSlotCell]: isMarker,
              [styles.clippedBefore]: isMarker && isBeforeRange,
              [styles.clippedAfter]: isMarker && isAfterRange,
            })}
            key={slot}
            title={isMarker ? `${lane.label}: ${lane.slot}` : undefined}
          />
        );
      })}
    </div>
  );
});

interface FutureSlotsProps {
  lanes: SlotLane[];
  cellCount: number;
}

function FutureSlots({ lanes, cellCount }: FutureSlotsProps) {
  const columns = `repeat(${cellCount}, minmax(0, 1fr))`;

  return (
    <div className={clsx(styles.timelineSection, styles.nextLeaderContainer)}>
      <NextLeaderTimer />
      {lanes.map(({ id }) => (
        <div
          aria-hidden="true"
          className={styles.futureSlotCells}
          key={id}
          style={{ gridTemplateColumns: columns }}
        >
          {Array.from({ length: cellCount }).map((_, index) => (
            <div className={styles.futureSlotCell} key={index} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface NextLeaderSlotsProps {
  lanes: SlotLane[];
  nextLeaderLane: SlotLane;
}

function NextLeaderSlots({ lanes, nextLeaderLane }: NextLeaderSlotsProps) {
  const headerText = nextLeaderLane.slot ?? "never";

  return (
    <div className={styles.timelineSection}>
      <MonoText
        className={clsx(styles.slotHeaderCell, styles.nextLeaderSlotHeader)}
        title={`${headerText}`}
      >
        {headerText}
      </MonoText>
      {lanes.map((lane) => (
        <div
          aria-hidden="true"
          className={clsx(styles.slotCell, styles.nextLeaderSlotCell, {
            /* No slot means no marker to place - the header carries the
               answer on its own. */
            [styles.activeSlotCell]:
              lane.id === "nextLeader" && nextLeaderLane.slot != null,
          })}
          key={lane.id}
          style={{ "--lane-color": lane.color } as LaneStyle}
        />
      ))}
    </div>
  );
}

/* useNextSlot already renders "Never" for a missing next leader slot, so
   the timer needs no special case. */
function NextLeaderTimer() {
  const { progressSinceLastLeader, nextSlotText } = useNextSlot({
    showNowIfCurrent: false,
  });

  return (
    <div className={styles.nextLeaderTimer}>
      <Progress
        className={styles.nextLeaderProgress}
        value={progressSinceLastLeader}
        height="2px"
      />
      <Text className={styles.nextLeaderTimerText} wrap="nowrap">
        <span className={styles.nextLeaderTimerLabel}>Time Until Leader</span>{" "}
        <MonoText weight="bold">{nextSlotText}</MonoText>
      </Text>
    </div>
  );
}
