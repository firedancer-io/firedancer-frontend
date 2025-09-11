import { useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  epochAtom,
  leaderSlotsAtom,
  SlotNavFilter,
  slotNavFilterAtom,
  slotOverrideAtom,
} from "../../atoms";
import { Box } from "@radix-ui/themes";
import type { RefObject } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./slotsList.module.css";
import { slotsListPinnedSlotOffset, slotsPerLeader } from "../../consts";
import { throttle } from "lodash";
import SlotsRenderer, { SlotsPlaceholder } from "./SlotsRenderer";
import type { ScrollSeekConfiguration, VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { baseSelectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import ResetLive from "./ResetLive";
import type { DebouncedState } from "use-debounce";
import { useDebouncedCallback } from "use-debounce";
import { useCurrentRoute } from "../../hooks/useCurrentRoute";
import { getSlotGroupLeader } from "../../utils";
import clsx from "clsx";

const computeItemKey = (slot: number) => slot;

// Add one future slot to prevent current leader transition from flickering
const increaseViewportBy = { top: 24, bottom: 0 };

interface SlotsListProps {
  width: number;
  height: number;
}

export default function SlotsList({ width, height }: SlotsListProps) {
  const currentRoute = useCurrentRoute();
  const navFilter = useAtomValue(slotNavFilterAtom);
  const epoch = useAtomValue(epochAtom);
  const isSelectionInitialized =
    useAtomValue(baseSelectedSlotAtom).isInitialized;

  if (!epoch || (currentRoute === "Slot Details" && !isSelectionInitialized)) {
    return null;
  }

  return navFilter === SlotNavFilter.MySlots ? (
    <MySlotsList key={epoch.epoch} width={width} height={height} />
  ) : (
    <AllSlotsList key={epoch.epoch} width={width} height={height} />
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

  const [hideList, setHideList] = useState(true);

  useEffect(() => {
    // initially hide list to
    const timeout = setTimeout(() => {
      setHideList(false);
    }, 100);

    return () => clearTimeout(timeout);
  }, []);

  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const slotsCount = slotGroupsDescending.length;

  const debouncedScroll = useDebouncedCallback(() => {}, 100);

  const { rangeChanged, scrollSeekConfiguration } = useMemo(() => {
    const rangeChangedFn = ({ startIndex }: { startIndex: number }) => {
      // account for increaseViewportBy
      visibleStartIndexRef.current = startIndex + 1;
    };

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

        debouncedScroll();

        const slotIndex = Math.min(
          visibleStartIndexRef.current + slotsListPinnedSlotOffset,
          slotsCount - 1,
        );

        const slot = getSlotAtIndex(slotIndex);
        setSlotOverride(slot);
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
  }, [
    getSlotAtIndex,
    debouncedScroll,
    setSlotOverride,
    slotsCount,
    visibleStartIndexRef,
  ]);

  return (
    <Box
      ref={listContainerRef}
      position="relative"
      width={`${width}px`}
      height={`${height}px`}
    >
      <RTAutoScroll listRef={listRef} getIndexForSlot={getIndexForSlot} />
      <SlotOverrideScroll
        listRef={listRef}
        getIndexForSlot={getIndexForSlot}
        debouncedScroll={debouncedScroll}
      />
      <SlotsPlaceholder width={width} height={height} />
      <ResetLive />
      <Virtuoso
        ref={listRef}
        className={clsx(styles.slotsList, { [styles.hidden]: hideList })}
        width={width}
        height={height}
        data={slotGroupsDescending}
        totalCount={slotsCount}
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

interface RTAutoScrollProps {
  listRef: RefObject<VirtuosoHandle>;
  getIndexForSlot: (slot: number) => number;
}
function RTAutoScroll({ listRef, getIndexForSlot }: RTAutoScrollProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const autoScroll = useAtomValue(autoScrollAtom);

  useEffect(() => {
    if (!autoScroll || currentLeaderSlot === undefined || !listRef.current)
      return;

    // scroll to new current leader slot
    const slotIndex = getIndexForSlot(currentLeaderSlot);
    const visibleStartIndex = slotIndex - slotsListPinnedSlotOffset;

    listRef.current.scrollToIndex({
      index: visibleStartIndex > 0 ? visibleStartIndex : 0,
      align: "start",
    });
  }, [autoScroll, currentLeaderSlot, getIndexForSlot, listRef]);

  return null;
}

interface SlotOverrideScrollProps {
  listRef: RefObject<VirtuosoHandle>;
  getIndexForSlot: (slot: number) => number;
  debouncedScroll: DebouncedState<() => void>;
}
function SlotOverrideScroll({
  listRef,
  getIndexForSlot,
  debouncedScroll,
}: SlotOverrideScrollProps) {
  const rafIdRef = useRef<number | null>(null);
  const slotOverride = useAtomValue(slotOverrideAtom);

  useEffect(() => {
    if (!slotOverride || !listRef.current || debouncedScroll.isPending())
      return;

    const targetIndex = Math.max(
      0,
      getIndexForSlot(slotOverride) - slotsListPinnedSlotOffset,
    );

    const prevRafId = rafIdRef.current;
    rafIdRef.current = requestAnimationFrame(() => {
      if (prevRafId !== null) {
        cancelAnimationFrame(prevRafId);
      }

      listRef.current?.scrollToIndex({
        index: targetIndex,
        align: "start",
      });
    });

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [getIndexForSlot, slotOverride, listRef, debouncedScroll]);

  return null;
}

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
  const mySlots = useAtomValue(leaderSlotsAtom);

  const slotGroupsDescending = useMemo(
    () => mySlots?.toReversed() ?? [],
    [mySlots],
  );

  const slotToIndexMapping = useMemo(() => {
    return slotGroupsDescending.reduce<{ [slot: number]: number }>(
      (acc, slot, index) => {
        acc[slot] = index;
        return acc;
      },
      {},
    );
  }, [slotGroupsDescending]);

  const getSlotAtIndex = useCallback(
    (index: number) => slotGroupsDescending[index],
    [slotGroupsDescending],
  );

  // Get the slot index, or if unavailable, the closest past index
  const getClosestIndexForSlot = useCallback(
    (slot: number) => {
      return (
        slotToIndexMapping[getSlotGroupLeader(slot)] ??
        slotGroupsDescending.findIndex((s) => s <= slot)
      );
    },
    [slotGroupsDescending, slotToIndexMapping],
  );

  if (!mySlots) return null;

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
