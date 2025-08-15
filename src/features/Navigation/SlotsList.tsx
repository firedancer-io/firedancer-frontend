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
import type React from "react";
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
import type { Epoch } from "../../api/types";

const increaseViewportBy = { top: 600, bottom: 600 };
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

function getSlotIndexForEpoch(slot: number, epoch?: Epoch) {
  if (!epoch || slot < epoch.start_slot || slot > epoch.end_slot) return -1;
  return Math.floor((epoch.end_slot - slot) / slotsPerLeader);
}

function AllSlotsList({ width, height }: SlotsListProps) {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VirtuosoHandle>(null);

  const visibleStartIndexRef = useRef<number | null>(null);

  const epoch = useAtomValue(epochAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const slotOverride = useAtomValue(slotOverrideAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);

  const numSlotsInEpoch = useMemo(
    () => (epoch ? epoch.end_slot - epoch.start_slot + 1 : 0),
    [epoch],
  );

  const slotGroupsDescending = useMemo(() => {
    if (!epoch) return [];

    return Array.from(
      { length: Math.ceil(numSlotsInEpoch / slotsPerLeader) },
      (_, i) => epoch.end_slot - i * slotsPerLeader - (slotsPerLeader - 1),
    );
  }, [epoch, numSlotsInEpoch]);

  const getSlotAtIndex = useCallback(
    (index: number) => slotGroupsDescending[index],
    [slotGroupsDescending],
  );

  const setSlotScrollListFn = useSetAtom(setSlotScrollListFnAtom);
  useEffect(() => {
    setSlotScrollListFn((startOverrideSlot: number | undefined) => {
      if (!listRef.current || !startOverrideSlot) return;
      const slotIndex = getSlotIndexForEpoch(startOverrideSlot, epoch);
      listRef.current.scrollToIndex({
        index: slotIndex - slotsListPinnedSlotOffset,
        align: "start",
      });
    });

    return () => {
      setSlotScrollListFn(undefined);
    };
  }, [setSlotScrollListFn, epoch]);

  // Determine initial scroll position
  const initialTopMostItemIndex = useMemo(() => {
    if (selectedSlot !== undefined) {
      const slotIndex = getSlotIndexForEpoch(selectedSlot, epoch);
      return slotIndex > 0 ? slotIndex - slotsListPinnedSlotOffset : slotIndex;
    } else if (slotOverride !== undefined) {
      const slotIndex = getSlotIndexForEpoch(slotOverride, epoch);
      return slotIndex > 0 ? slotIndex - slotsListPinnedSlotOffset : slotIndex;
    } else if (currentLeaderSlot !== undefined) {
      const slotIndex = getSlotIndexForEpoch(currentLeaderSlot, epoch);
      const visibleStartIndex = slotIndex - slotsListFutureSlotsOffset;
      return visibleStartIndex > 0 ? visibleStartIndex : 0;
    }
    return -1;
  }, [selectedSlot, slotOverride, currentLeaderSlot, epoch]);

  const setSlotOverride = useSetAtom(slotOverrideAtom);

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

  return (
    <Box ref={listContainerRef} width={`${width}px`} height={`${height}px`}>
      <HandleSlotOverride listRef={listRef} />
      <SlotsPlaceholder width={width} height={height} />
      <ResetLive />
      <Virtuoso
        ref={listRef}
        className={styles.slotsList}
        width={width}
        height={height}
        data={slotGroupsDescending}
        totalCount={slotGroupsDescending.length}
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

function HandleSlotOverride({
  listRef,
}: {
  listRef: React.RefObject<VirtuosoHandle>;
}) {
  const epoch = useAtomValue(epochAtom);
  const autoScroll = useAtomValue(autoScrollAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  // Auto scroll enabled (live scrolling)
  useEffect(() => {
    if (
      !autoScroll ||
      !epoch ||
      currentLeaderSlot === undefined ||
      !listRef.current
    )
      return;

    const slotIndex = getSlotIndexForEpoch(currentLeaderSlot, epoch);
    const visibleStartIndex = slotIndex - slotsListFutureSlotsOffset;

    listRef.current.scrollToIndex({
      index: visibleStartIndex > 0 ? visibleStartIndex : 0,
      behavior: "auto",
      align: "start",
    });
  }, [autoScroll, currentLeaderSlot, epoch, listRef]);

  // Scroll to selected slot (disable auto scrolling)
  useEffect(() => {
    if (selectedSlot === undefined) return;
    setSlotOverride(selectedSlot);
  }, [selectedSlot, setSlotOverride]);

  return null;
}

function MySlotsList({ width, height }: SlotsListProps) {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VirtuosoHandle>(null);
  const visibleStartIndexRef = useRef<number | null>(null);

  const selectedSlot = useAtomValue(selectedSlotAtom);
  const slotOverride = useAtomValue(slotOverrideAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
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

  const setSlotScrollListFn = useSetAtom(setSlotScrollListFnAtom);
  useEffect(() => {
    setSlotScrollListFn((startOverrideSlot: number | undefined) => {
      if (!listRef.current || !startOverrideSlot) return;

      const slotIndex = getClosestIndexForSlot(startOverrideSlot);

      listRef.current.scrollToIndex({
        index: slotIndex - slotsListPinnedSlotOffset,
        align: "start",
      });
    });

    return () => {
      setSlotScrollListFn(undefined);
    };
  }, [getClosestIndexForSlot, setSlotScrollListFn]);

  // Determine initial scroll position
  const initialTopMostItemIndex = useMemo(() => {
    if (selectedSlot !== undefined) {
      const slotIndex = getClosestIndexForSlot(selectedSlot);
      return slotIndex > 0 ? slotIndex - slotsListPinnedSlotOffset : slotIndex;
    } else if (slotOverride !== undefined) {
      const slotIndex = getClosestIndexForSlot(slotOverride);
      return slotIndex > 0 ? slotIndex - slotsListPinnedSlotOffset : slotIndex;
    } else if (currentLeaderSlot !== undefined) {
      const slotIndex = getClosestIndexForSlot(currentLeaderSlot);
      const visibleStartIndex = slotIndex - slotsListFutureSlotsOffset;
      return visibleStartIndex > 0 ? visibleStartIndex : 0;
    }
    return -1;
  }, [selectedSlot, slotOverride, currentLeaderSlot, getClosestIndexForSlot]);

  const setSlotOverride = useSetAtom(slotOverrideAtom);

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

  const autoScroll = useAtomValue(autoScrollAtom);

  // Auto scroll enabled (live scrolling)
  useEffect(() => {
    if (!autoScroll || currentLeaderSlot === undefined || !listRef.current)
      return;
    const slotIndex = getClosestIndexForSlot(currentLeaderSlot);
    const visibleStartIndex = slotIndex - slotsListFutureSlotsOffset;
    listRef.current.scrollToIndex({
      index: visibleStartIndex > 0 ? visibleStartIndex : 0,
      align: "start",
    });
  }, [autoScroll, currentLeaderSlot, getClosestIndexForSlot, listRef]);

  // Scroll to selected slot (disable auto scrolling)
  useEffect(() => {
    if (selectedSlot === undefined) return;
    setSlotOverride(selectedSlot);
  }, [selectedSlot, setSlotOverride]);

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
        totalCount={slotGroupsDescending.length}
        initialTopMostItemIndex={initialTopMostItemIndex}
        increaseViewportBy={increaseViewportBy}
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
