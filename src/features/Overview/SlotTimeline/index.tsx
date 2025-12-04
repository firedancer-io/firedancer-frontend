import { useAtomValue } from "jotai";
import {
  completedSlotAtom,
  optimisticallyConfirmedSlotAtom,
  repairSlotAtom,
  rootSlotAtom,
  storageSlotAtom,
  turbineSlotAtom,
  voteSlotAtom,
} from "../../../api/atoms";
import { nextLeaderSlotAtom } from "../../../atoms";
import { Box, Flex, Grid, Progress, Text } from "@radix-ui/themes";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Card from "../../../components/Card";
import { headerGap } from "../../Gossip/consts";
import { useMeasure, useMedia } from "react-use";
import { getMax, getMin } from "../../../utils";
import styles from "./slotTimeline.module.css";
import clsx from "clsx";
import type { SlotBarInfo } from "./types";
import { useGroupedSlotBars } from "./useGroupHighlightedSlots";
import useNextSlot from "../../../hooks/useNextSlot";
import FlashText from "../../../components/FlashText";
import { clamp } from "lodash";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import MonoText from "../../../components/MonoText";

const barTrackGapValue = 2;
const barTrackGap = `${barTrackGapValue}px`;
const labelTrackGap = "5px";
const minBarWidth = 2;
// the expected distance from storage slot to reset slot
const _minCurrentSlots = 32;
// Make sure it's evenly divisilbe by 2 since the next slots section is half the width
const minCurrentSlots = _minCurrentSlots - (_minCurrentSlots % 2);

const storageColor = "#7170EF";
const rootColor = "#DE64B1";
const voteColor = "#388DCF";
const replayColor = "#219C8E";
const repairColor = "#B87745";
const turbineColor = "#6684FF";
const confirmedColor = "#eee";
const nextLeaderColor = "#488EDF";

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
        <SlotBars />
      </Flex>
    </Card>
  );
}

function getSlotDt(
  dtSlot: number | null | undefined,
  referenceSlot: number | null | undefined,
) {
  if (referenceSlot == null || dtSlot == null) return;
  return dtSlot - referenceSlot;
}

function getSlotBarInfo(
  label: string,
  dtSlot: number | null | undefined,
  referenceSlot: number | null | undefined,
  color: string,
): SlotBarInfo {
  return {
    label,
    slot: dtSlot,
    slotDt: getSlotDt(dtSlot, referenceSlot),
    color,
  };
}

const defaultBarWidth = 14;
const SlotBarsContext = createContext({
  barWidth: defaultBarWidth,
  shrinkSlotsLabel: false,
  useLabelGrid: false,
});

function SlotBars() {
  const [barWidth, setBarWidth] = useState(defaultBarWidth);
  const storageSlot = useAtomValue(storageSlotAtom);
  const rootSlot = useAtomValue(rootSlotAtom);
  const voteSlot = useAtomValue(voteSlotAtom);
  const repairSlot = useAtomValue(repairSlotAtom);
  const turbineSlot = useAtomValue(turbineSlotAtom);
  const replaySlot = useAtomValue(completedSlotAtom);
  const optimisticallyConfirmedSlot = useAtomValue(
    optimisticallyConfirmedSlotAtom,
  );
  const nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);

  const shrinkSlotsLabel = useMedia("(max-width: 1300px)");
  const useLabelGrid = useMedia("(max-width: 1000px)");

  const {
    storageSlotBar,
    rootSlotBar,
    voteSlotBar,
    repairSlotBar,
    turbineSlotBar,
    replaySlotBar,
    optimisticallyConfirmedBar,
    nextLeaderSlotBar,
  } = useMemo(() => {
    const storageSlotBar = getSlotBarInfo(
      "Storage",
      storageSlot,
      replaySlot,
      storageColor,
    );
    const rootSlotBar = getSlotBarInfo("Root", rootSlot, replaySlot, rootColor);
    const voteSlotBar = getSlotBarInfo(
      "Voted",
      voteSlot,
      replaySlot,
      voteColor,
    );
    const repairSlotBar = getSlotBarInfo(
      "Repair",
      repairSlot,
      replaySlot,
      repairColor,
    );
    const turbineSlotBar = getSlotBarInfo(
      "Turbine",
      turbineSlot,
      replaySlot,
      turbineColor,
    );
    const replaySlotBar = getSlotBarInfo(
      "Processed",
      replaySlot,
      replaySlot,
      replayColor,
    );
    const optimisticallyConfirmedBar = getSlotBarInfo(
      "Confirmed",
      optimisticallyConfirmedSlot,
      replaySlot,
      confirmedColor,
    );
    const nextLeaderSlotBar = getSlotBarInfo(
      "Next Leader",
      nextLeaderSlot,
      replaySlot,
      nextLeaderColor,
    );

    return {
      storageSlotBar,
      rootSlotBar,
      voteSlotBar,
      repairSlotBar,
      turbineSlotBar,
      replaySlotBar,
      optimisticallyConfirmedBar,
      nextLeaderSlotBar,
    };
  }, [
    nextLeaderSlot,
    optimisticallyConfirmedSlot,
    repairSlot,
    replaySlot,
    rootSlot,
    storageSlot,
    turbineSlot,
    voteSlot,
  ]);

  const contextValue = useMemo(
    () => ({ barWidth, shrinkSlotsLabel, useLabelGrid }),
    [barWidth, shrinkSlotsLabel, useLabelGrid],
  );

  if (!replaySlot) return;

  const maxCurrentSlot = getMax([
    voteSlotBar.slot,
    repairSlotBar.slot,
    turbineSlotBar.slot,
    replaySlotBar.slot,
    optimisticallyConfirmedBar.slot,
  ]);

  // Sized to default the root to turbine as minCurrentSlots slots, and half that width for the next slots portion
  const currentSlotsSize =
    rootSlot != null || storageSlot != null
      ? Math.max(
          minCurrentSlots,
          getMax([replaySlot, turbineSlot]) - getMax([rootSlot, storageSlot]),
        )
      : minCurrentSlots;
  const nextSlotsSize = Math.max(
    // Don't shrink it past 1/8 of the current slot size or the next leader text won't be visible
    currentSlotsSize / 8,
    minCurrentSlots / 2 + (minCurrentSlots - currentSlotsSize),
  );

  return (
    <SlotBarsContext.Provider value={contextValue}>
      {useLabelGrid && (
        <LabelsGrid
          storageSlotBar={storageSlotBar}
          rootSlotBar={rootSlotBar}
          voteSlotBar={voteSlotBar}
          repairSlotBar={repairSlotBar}
          turbineSlotBar={turbineSlotBar}
          confirmedSlotBar={optimisticallyConfirmedBar}
          replaySlotBar={replaySlotBar}
          nextLeaderSlotBar={nextLeaderSlotBar}
        />
      )}
      <Flex gap={barTrackGap}>
        <PrevSlots
          storageSlotBar={storageSlotBar}
          rootSlotBar={rootSlotBar}
          repairSlotBar={repairSlotBar}
        />
        <Grid
          columns={`${currentSlotsSize}fr ${nextSlotsSize}fr`}
          gapX={barTrackGap}
          flexGrow="1"
        >
          <CurrentSlots
            voteSlotBar={voteSlotBar}
            repairSlotBar={repairSlotBar}
            turbineSlotBar={turbineSlotBar}
            replaySlotBar={replaySlotBar}
            confirmedSlotBar={optimisticallyConfirmedBar}
            minSlot={rootSlot ?? replaySlot - 32}
            maxSlot={maxCurrentSlot}
            setBarWidth={setBarWidth}
          />
          <NextSlots
            nextLeaderSlotBar={nextLeaderSlotBar}
            minSlot={maxCurrentSlot}
          />
        </Grid>
      </Flex>
    </SlotBarsContext.Provider>
  );
}

const maxPrevBarCount = 20;

interface PrevSlotsProps {
  storageSlotBar: SlotBarInfo;
  rootSlotBar: SlotBarInfo;
  repairSlotBar: SlotBarInfo;
}

function PrevSlots({
  storageSlotBar,
  rootSlotBar,
  repairSlotBar,
}: PrevSlotsProps) {
  const { barWidth, useLabelGrid } = useContext(SlotBarsContext);
  const [measureRef, measureRect] = useMeasure<HTMLDivElement>();

  const slotBarsArr = useMemo(
    () => [storageSlotBar, rootSlotBar],
    [rootSlotBar, storageSlotBar],
  );
  const slotBarsWithRepairArr = useMemo(
    () => [...slotBarsArr, repairSlotBar],
    [repairSlotBar, slotBarsArr],
  );
  const groupedSlotBars = useGroupedSlotBars(slotBarsWithRepairArr);

  const fillerSlotCount = useMemo(() => {
    if (!barWidth) return 0;
    // Not exact as could be up to 3 bars + gaps but close enough
    const width = measureRect.width - (barWidth * 3 - barTrackGapValue * 2);
    const fillerParWidth = Math.max(minBarWidth, barWidth / 2);
    // make sure there is a max because on small screens and hiding the labels, there can be an infinite loop of increasing filler bars
    // which leads to smaller bar widths which again leads to more filler bars
    return Math.min(20, Math.trunc(width / fillerParWidth));
  }, [barWidth, measureRect.width]);

  // Don't show repair slot if it's not in this section (past root slot), but do include if before or equal to root slot
  const maxSlot = getMax([storageSlotBar.slot, rootSlotBar.slot]);
  const minSlot =
    getMin([storageSlotBar.slot, rootSlotBar.slot, repairSlotBar.slot]) - 1;
  const range = maxSlot - minSlot;
  // If repair goes far beyond root slot, start shrinking the bars by not defining a width to avoid overflow
  const slotBarWidth = range < 7 ? barWidth : undefined;
  const usingReducedBarCount = range > maxPrevBarCount;
  // To not draw too many bars, clamp the max of the number of bars and just assume the first one is the repair slot
  const barCount = usingReducedBarCount ? maxPrevBarCount : range;
  const initialSlot = maxSlot - barCount;

  return (
    <Flex
      direction="column"
      gap={labelTrackGap}
      // When the labels are no longer shown in grid mode, there needs to be some minimum width to draw filler bars
      minWidth={useLabelGrid ? "30px" : undefined}
    >
      {!useLabelGrid && (
        <Flex gap={labelTrackGap} justify="end">
          {slotBarsArr.map((slotBar) => (
            <MSlotLabel key={slotBar.label} slotBarInfo={slotBar} />
          ))}
        </Flex>
      )}
      <Flex
        className={styles.slotBarTrack}
        align="stretch"
        justify="end"
        gap={barTrackGap}
        ref={measureRef}
      >
        <MFillerBars count={fillerSlotCount} />
        {Array.from({ length: barCount }).map((_, i) => {
          const slot = initialSlot + i + 1;
          const slotBars =
            // Show the repair slot bar as the first non-filler bar shown if it's too far behind our rootSlot - barCount
            usingReducedBarCount && i === 0
              ? groupedSlotBars.get(repairSlotBar.slot ?? 0)
              : groupedSlotBars.get(slot);

          if (slotBars) {
            return (
              <HighlightedSlotBar
                key={slot}
                colors={slotBars.map(({ color }) => color)}
                barWidth={slotBarWidth}
              />
            );
          }
          return <MSlotBar key={slot} barWidth={slotBarWidth} />;
        })}
      </Flex>
    </Flex>
  );
}

interface CurrentSlotsProps {
  voteSlotBar: SlotBarInfo;
  repairSlotBar: SlotBarInfo;
  turbineSlotBar: SlotBarInfo;
  replaySlotBar: SlotBarInfo;
  confirmedSlotBar: SlotBarInfo;
  minSlot: number;
  maxSlot: number;
  setBarWidth: (barWidth: number) => void;
}

function CurrentSlots({
  voteSlotBar,
  repairSlotBar,
  turbineSlotBar,
  replaySlotBar,
  confirmedSlotBar,
  maxSlot,
  minSlot,
  setBarWidth,
}: CurrentSlotsProps) {
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();
  const { useLabelGrid } = useContext(SlotBarsContext);

  const slotBarsArr = useMemo(
    () => [
      repairSlotBar,
      confirmedSlotBar,
      voteSlotBar,
      replaySlotBar,
      turbineSlotBar,
    ],
    [
      confirmedSlotBar,
      repairSlotBar,
      replaySlotBar,
      turbineSlotBar,
      voteSlotBar,
    ],
  );
  const groupedSlotBars = useGroupedSlotBars(slotBarsArr);

  const barCount = clamp(maxSlot - minSlot, minCurrentSlots, 100);

  const barCountRef = useRef(barCount);
  barCountRef.current = barCount;

  useEffect(() => {
    if (width) {
      const barWidth = Math.trunc(
        (width - barTrackGapValue * (barCount - 1)) / barCount,
      );
      setBarWidth(barWidth);
    }
  }, [barCount, setBarWidth, width]);

  return (
    <Flex
      direction="column"
      gap={labelTrackGap}
      ref={measureRef}
      minWidth="100px"
    >
      {!useLabelGrid && (
        <Flex gap={labelTrackGap} justify="end">
          {slotBarsArr.map((slotBar) => (
            <MSlotLabel key={slotBar.label} slotBarInfo={slotBar} />
          ))}
        </Flex>
      )}
      <Flex
        className={styles.slotBarTrack}
        align="stretch"
        justify="end"
        gap={barTrackGap}
      >
        {Array.from({ length: barCount }).map((_, i) => {
          const slot = minSlot + i + 1;
          const slotBars = groupedSlotBars.get(slot);
          if (slotBars) {
            return (
              <HighlightedSlotBar
                key={slot}
                colors={slotBars.map(({ color }) => color)}
              />
            );
          }
          return <MSlotBar key={slot} />;
        })}
      </Flex>
    </Flex>
  );
}

interface NextSlotsProps {
  nextLeaderSlotBar: SlotBarInfo;
  minSlot: number;
}

function NextSlots({ nextLeaderSlotBar, minSlot }: NextSlotsProps) {
  const { barWidth, useLabelGrid } = useContext(SlotBarsContext);
  const [measureRef, measureRect] = useMeasure<HTMLDivElement>();

  const _fillerSlotCount = useMemo(() => {
    if (!barWidth) return 0;
    const width = measureRect.width - barWidth;
    const fillerParWidth = Math.max(minBarWidth, barWidth / 2);
    return Math.trunc(width / fillerParWidth);
  }, [barWidth, measureRect.width]);

  // Draw the actual number of slots till next leader slot if they fit
  const fillerSlotCount =
    nextLeaderSlotBar.slot != null
      ? Math.min(_fillerSlotCount, nextLeaderSlotBar.slot - minSlot)
      : _fillerSlotCount;

  return (
    <Flex
      direction="column"
      gap={labelTrackGap}
      minWidth="0"
      className={styles.nextLeaderContainer}
      justify="between"
    >
      {!useLabelGrid && (
        <Flex justify="end" gap={labelTrackGap}>
          <NextLeaderTimer />
          <MSlotLabel
            key={nextLeaderSlotBar.label}
            slotBarInfo={nextLeaderSlotBar}
          />
        </Flex>
      )}
      <Flex
        className={styles.slotBarTrack}
        align="stretch"
        justify="end"
        gap={barTrackGap}
        ref={measureRef}
      >
        <MFillerBars count={fillerSlotCount} />
        {nextLeaderSlotBar.slot && (
          <HighlightedSlotBar
            colors={[nextLeaderSlotBar.color]}
            barWidth={barWidth / 2}
          />
        )}
      </Flex>
    </Flex>
  );
}

function NextLeaderTimer() {
  const { progressSinceLastLeader, nextSlotText } = useNextSlot({
    showNowIfCurrent: false,
  });

  return (
    <Flex
      direction="column"
      flexGrow="1"
      p="5px"
      align="stretch"
      justify="between"
      minWidth="70px"
    >
      <Text align="center" wrap="nowrap">
        <Text
          style={{ color: "#919191" }}
          className={styles.nextLeaderTimerLabel}
        >
          Time Until Leader
        </Text>
        <Text style={{ color: "#BCBCBC" }}>&nbsp;{nextSlotText}</Text>
      </Text>
      <div>
        <Progress
          value={progressSinceLastLeader}
          className={styles.progress}
          // a bit longer than an expected slot duration
          duration="500ms"
        />
      </div>
    </Flex>
  );
}

interface SlotLabelProps {
  slotBarInfo: SlotBarInfo;
}

const MSlotLabel = memo(function SlotLabel({ slotBarInfo }: SlotLabelProps) {
  const { shrinkSlotsLabel } = useContext(SlotBarsContext);
  const { slot, slotDt, color, label } = slotBarInfo;
  if (slot == null || slotDt == null) return;

  const formattedLabel = `${label}${shrinkSlotsLabel ? "" : " Slot"}`;
  const formattedDt = `${Math.abs(slotDt)}`;

  return (
    <Flex
      direction="column"
      align="stretch"
      className={styles.slotLabelCard}
      style={{
        background: color,
      }}
      minWidth="50px"
    >
      <Flex gap="5px" justify="between">
        <Text
          className={styles.slotLabelName}
          weight="bold"
          wrap="nowrap"
          truncate
          dir="rtl"
        >
          {formattedLabel}
        </Text>

        {slotBarInfo.label !== "Processed" && (
          <Text
            weight="bold"
            className={styles.slotLabelDt}
            style={{
              whiteSpace: "pre",
            }}
          >
            <MonoText>{slotDt >= 0 ? "+" : "-"}</MonoText>
            {formattedDt}
          </Text>
        )}
      </Flex>
      <FlashText
        align="center"
        truncate
        style={{ width: "100%" }}
        dir="rtl"
        value={slot}
      />
    </Flex>
  );
});

interface HighlightedSlotBarProps {
  colors: string[];
  barWidth?: number;
}

function HighlightedSlotBar({ colors, barWidth }: HighlightedSlotBarProps) {
  const flexGrow = barWidth ? undefined : "1";

  return (
    <Grid rows="repeat(auto-fill, 1fr)" gap={barTrackGap} flexGrow={flexGrow}>
      {colors.map((color) => (
        <MSlotBar key={color} barWidth={barWidth} color={color} />
      ))}
    </Grid>
  );
}

interface SlotBarProps {
  isDim?: boolean;
  color?: string;
  barWidth?: number;
}

const MSlotBar = memo(function SlotBar({
  isDim,
  color,
  barWidth,
}: SlotBarProps) {
  const flexGrow = barWidth ? undefined : "1";

  return (
    <Box
      width={`${barWidth}px`}
      flexGrow={flexGrow}
      className={clsx(styles.slotBar, { [styles.dim]: isDim })}
      style={{ "--bar-color": color } as CSSProperties}
    />
  );
});

interface FillerBarsProps {
  count: number;
}

const MFillerBars = function FillerBars({ count }: FillerBarsProps) {
  return Array.from({ length: count }).map((_, i) => (
    <MSlotBar key={i} isDim />
  ));
};

interface LabelsGridProps {
  storageSlotBar: SlotBarInfo;
  rootSlotBar: SlotBarInfo;
  voteSlotBar: SlotBarInfo;
  repairSlotBar: SlotBarInfo;
  turbineSlotBar: SlotBarInfo;
  replaySlotBar: SlotBarInfo;
  confirmedSlotBar: SlotBarInfo;
  nextLeaderSlotBar: SlotBarInfo;
}

function LabelsGrid({
  storageSlotBar,
  rootSlotBar,
  voteSlotBar,
  repairSlotBar,
  turbineSlotBar,
  replaySlotBar,
  confirmedSlotBar,
  nextLeaderSlotBar,
}: LabelsGridProps) {
  return (
    <Grid columns={{ xs: "4", initial: "2" }} gap={labelTrackGap}>
      <MSlotLabel slotBarInfo={storageSlotBar} />
      <MSlotLabel slotBarInfo={rootSlotBar} />
      <MSlotLabel slotBarInfo={repairSlotBar} />
      <MSlotLabel slotBarInfo={confirmedSlotBar} />
      <MSlotLabel slotBarInfo={voteSlotBar} />
      <MSlotLabel slotBarInfo={replaySlotBar} />
      <MSlotLabel slotBarInfo={turbineSlotBar} />
      <MSlotLabel slotBarInfo={nextLeaderSlotBar} />
      <Box gridColumn={{ xs: "span 4", initial: "span 2" }}>
        <NextLeaderTimer />
      </Box>
    </Grid>
  );
}
