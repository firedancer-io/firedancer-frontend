import { useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  epochAtom,
  leaderSlotsAtom,
  SlotNavFilter,
  slotNavFilterAtom,
  setSlotScrollListFnAtom,
  slotOverrideAtom,
} from "../../atoms";
import { Box } from "@radix-ui/themes";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import styles from "./slotsList.module.css";
import {
  slotsListFutureSlotsOffset,
  slotsListPinnedSlotOffset,
  slotsPerLeader,
} from "../../consts";
import { throttle } from "lodash";
import SlotsRenderer, { SlotsPlaceholder } from "./SlotsRenderer";
import type { ScrollSeekConfiguration, VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import ResetLive from "./ResetLive";

const computeItemKey = (slot: number) => slot;

interface SlotsListProps {
  width: number;
  height: number;
}

export default function SlotsList({ width, height }: SlotsListProps) {
  const navFilter = useAtomValue(slotNavFilterAtom);
  return navFilter === SlotNavFilter.MySlots ? (
    <MySlotsList width={width} height={height} />
  ) : (
    <AllSlotsList width={width} height={height} />
  );
}

interface InnerSlotsListProps {
  width: number;
  height: number;
  slotGroupsDescending: number[];
  getSlotAtIndex: (index: number) => number;
  getIndexForSlot: (slot: number) => number;
}
function InnerSlotsList({
  width,
  height,
  slotGroupsDescending,
  getSlotAtIndex,
  getIndexForSlot,
}: InnerSlotsListProps) {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VirtuosoHandle>(null);
  const visibleStartIndexRef = useRef<number | null>(null);

  const selectedSlot = useAtomValue(selectedSlotAtom);
  const slotOverride = useAtomValue(slotOverrideAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);

  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const autoScroll = useAtomValue(autoScrollAtom);
  const setSlotScrollListFn = useSetAtom(setSlotScrollListFnAtom);

  const slotsCount = slotGroupsDescending.length;

  useEffect(() => {
    // set scroll function, called when slot override is updated
    setSlotScrollListFn((startOverrideSlot: number | undefined) => {
      if (!listRef.current || !startOverrideSlot) return;

      const slotIndex = getIndexForSlot(startOverrideSlot);

      listRef.current.scrollToIndex({
        index: slotIndex - slotsListPinnedSlotOffset,
        align: "start",
      });
    });

    return () => {
      setSlotScrollListFn(undefined);
    };
  }, [getIndexForSlot, setSlotScrollListFn]);

  // Determine initial scroll position
  const initialTopMostItemIndex = useMemo(() => {
    if (selectedSlot !== undefined) {
      const slotIndex = getIndexForSlot(selectedSlot);
      return slotIndex > 0 ? slotIndex - slotsListPinnedSlotOffset : slotIndex;
    } else if (slotOverride !== undefined) {
      const slotIndex = getIndexForSlot(slotOverride);
      return slotIndex > 0 ? slotIndex - slotsListPinnedSlotOffset : slotIndex;
    } else if (currentLeaderSlot !== undefined) {
      const slotIndex = getIndexForSlot(currentLeaderSlot);
      const visibleStartIndex = slotIndex - slotsListFutureSlotsOffset;
      return visibleStartIndex > 0 ? visibleStartIndex : 0;
    }
    return -1;
  }, [selectedSlot, slotOverride, currentLeaderSlot, getIndexForSlot]);

  const { rangeChanged, scrollSeekConfiguration } = useMemo(() => {
    const rangeChangedFn = ({ startIndex }: { startIndex: number }) =>
      (visibleStartIndexRef.current = startIndex);

    const config: ScrollSeekConfiguration = {
      enter: (velocity) => Math.abs(velocity) > 1500,
      exit: (velocity) => Math.abs(velocity) < 500,
      change: (_, range) => rangeChangedFn(range),
    };
    return { rangeChanged: rangeChangedFn, scrollSeekConfiguration: config };
  }, [visibleStartIndexRef]);

  // Setup user scroll handling
  useEffect(() => {
    if (!listContainerRef.current) return;
    const container = listContainerRef.current;

    const handleSlotOverride = throttle(
      () => {
        if (visibleStartIndexRef.current === null) return;
        const slot = getSlotAtIndex(visibleStartIndexRef.current);
        setSlotOverride(
          slot ? slot + slotsListFutureSlotsOffset : undefined,
          true,
        );
      },
      50,
      { leading: true, trailing: true },
    );

    const handleScroll = () => {
      handleSlotOverride();
    };

    container.addEventListener("wheel", handleScroll);
    container.addEventListener("touchmove", handleScroll);

    return () => {
      container.removeEventListener("wheel", handleScroll);
      container.removeEventListener("touchmove", handleScroll);
    };
  }, [getSlotAtIndex, setSlotOverride, visibleStartIndexRef]);

  // Auto scroll enabled (live scrolling)
  useEffect(() => {
    if (
      !autoScroll ||
      currentLeaderSlot === undefined ||
      !listRef.current ||
      !slotsCount
    )
      return;

    const slotIndex = getIndexForSlot(currentLeaderSlot);
    const visibleStartIndex = slotIndex - slotsListFutureSlotsOffset;

    listRef.current.scrollToIndex({
      index: visibleStartIndex > 0 ? visibleStartIndex : 0,
      align: "start",
    });
  }, [autoScroll, currentLeaderSlot, getIndexForSlot, listRef, slotsCount]);

  // Scroll to selected slot (disable auto scrolling)
  useEffect(() => {
    if (selectedSlot === undefined) return;
    setSlotOverride(selectedSlot);
  }, [selectedSlot, setSlotOverride]);

  const increaseViewportBy = useMemo(() => {
    return { top: height, bottom: height };
  }, [height]);

  return (
    <Box ref={listContainerRef} width={`${width}px`} height={`${height}px`}>
      <SlotsPlaceholder width={width} height={height} />
      <ResetLive />
      <Virtuoso
        ref={listRef}
        className={styles.slotsList}
        width={width}
        height={height}
        data={slotGroupsDescending}
        totalCount={slotsCount}
        initialTopMostItemIndex={initialTopMostItemIndex}
        increaseViewportBy={increaseViewportBy}
        // height of past slots that the user is most likely to scroll through
        defaultItemHeight={42}
        skipAnimationFrameInResizeObserver
        computeItemKey={computeItemKey}
        itemContent={(_, data) => <SlotsRenderer leaderSlotForGroup={data} />}
        rangeChanged={rangeChanged}
        components={{ ScrollSeekPlaceholder: MScrollSeekPlaceHolder }}
        scrollSeekConfiguration={scrollSeekConfiguration}
      />
    </Box>
  );
}

// Render nothing when scrolling quickly to improve performance
const MScrollSeekPlaceHolder = memo(function ScrollSeekPlaceholder() {
  return null;
});

function AllSlotsList({ width, height }: SlotsListProps) {
  const epoch = useAtomValue(epochAtom);

  const slotGroupsDescending = useMemo(() => {
    if (!epoch) return [];

    const numSlotsInEpoch = epoch.end_slot - epoch.start_slot + 1;
    return Array.from(
      { length: Math.ceil(numSlotsInEpoch / slotsPerLeader) },
      (_, i) => epoch.end_slot - i * slotsPerLeader - (slotsPerLeader - 1),
    );
  }, [epoch]);

  const getSlotAtIndex = useCallback(
    (index: number) => slotGroupsDescending[index],
    [slotGroupsDescending],
  );

  const getIndexForSlot = useCallback(
    (slot: number) => {
      if (!epoch || slot < epoch.start_slot || slot > epoch.end_slot) return -1;
      return Math.trunc((epoch.end_slot - slot) / slotsPerLeader);
    },
    [epoch],
  );

  return (
    <InnerSlotsList
      width={width}
      height={height}
      slotGroupsDescending={slotGroupsDescending}
      getSlotAtIndex={getSlotAtIndex}
      getIndexForSlot={getIndexForSlot}
    />
  );
}

function MySlotsList({ width, height }: SlotsListProps) {
  const leaderSlots = useAtomValue(leaderSlotsAtom);

  const slotGroupsDescending = useMemo(
    () => leaderSlots?.toReversed() ?? [],
    [leaderSlots],
  );

  const getSlotAtIndex = useCallback(
    (index: number) => slotGroupsDescending[index],
    [slotGroupsDescending],
  );

  // Get the slot index, or if unavailable, the closest past index
  const getClosestIndexForSlot = useCallback(
    (slot: number) => {
      return slotGroupsDescending.findIndex((s) => s <= slot);
    },
    [slotGroupsDescending],
  );

  return (
    <InnerSlotsList
      width={width}
      height={height}
      slotGroupsDescending={slotGroupsDescending}
      getSlotAtIndex={getSlotAtIndex}
      getIndexForSlot={getClosestIndexForSlot}
    />
  );
}
