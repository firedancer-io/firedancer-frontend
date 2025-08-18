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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./slotsList.module.css";
import { slotsListPinnedSlotOffset, slotsPerLeader } from "../../consts";
import { clamp, throttle } from "lodash";
import SlotsRenderer, { SlotsPlaceholder } from "./SlotsRenderer";
import type { ScrollSeekConfiguration, VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import ResetLive from "./ResetLive";
import { useDebouncedCallback } from "use-debounce";

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
    let slotIndex = -1;

    if (selectedSlot !== undefined) {
      slotIndex = getIndexForSlot(selectedSlot);
    } else if (currentLeaderSlot !== undefined) {
      slotIndex = getIndexForSlot(currentLeaderSlot);
    }

    if (slotIndex === -1) return -1;

    return clamp(slotIndex - slotsListPinnedSlotOffset, 0, slotsCount - 1);
  }, [selectedSlot, currentLeaderSlot, slotsCount, getIndexForSlot]);

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

        const slotIndex = Math.min(
          visibleStartIndexRef.current + slotsListPinnedSlotOffset,
          slotsCount - 1,
        );

        const slot = getSlotAtIndex(slotIndex);
        setSlotOverride(slot, true);
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
  }, [getSlotAtIndex, setSlotOverride, slotsCount, visibleStartIndexRef]);

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
    const visibleStartIndex = slotIndex - slotsListPinnedSlotOffset;

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

  const debouncedHeight = useDebouncedHeight(height);

  const increaseViewportBy = useMemo(() => {
    // top must be 0, to prevent rangeChange startIndex offset
    return { top: 0, bottom: debouncedHeight };
  }, [debouncedHeight]);

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

function useDebouncedHeight(height: number) {
  const [debouncedHeight, setDebouncedHeight] = useState(height);

  const updateDebouncedHeight = useDebouncedCallback((h: number) => {
    setDebouncedHeight((prev) => (Math.abs(h - prev) >= 100 ? h : prev));
  }, 80);

  useMemo(() => {
    updateDebouncedHeight(height);
  }, [height, updateDebouncedHeight]);

  return debouncedHeight;
}
