import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  epochAtom,
  leaderSlotsAtom,
  SlotNavFilter,
  slotNavFilterAtom,
  slotOverrideAtom,
} from "../../atoms";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { RefObject } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./slotsList.module.css";
import { slotsListPinnedSlotOffset } from "../../consts";
import throttle from "lodash/throttle";
import SlotsRenderer, { MSlotsPlaceholder } from "./SlotsRenderer";
import type { ScrollSeekConfiguration, VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import ResetLive from "./ResetLive";
import type { DebouncedState } from "use-debounce";
import { useDebouncedCallback } from "use-debounce";
import {
  getAllSlotsListProps,
  getMySlotsListProps,
  type SlotsIndexProps,
} from "./utils";

const computeItemKey = (slot: number) => slot;

// Add one future slot to prevent current leader transition from flickering
const increaseViewportBy = { top: 24, bottom: 0 };

interface SlotsListProps {
  width: number;
  height: number;
}

export default function SlotsList({ width, height }: SlotsListProps) {
  const navFilter = useAtomValue(slotNavFilterAtom);
  const epoch = useAtomValue(epochAtom);

  if (!epoch) return null;

  return navFilter === SlotNavFilter.MySlots ? (
    <MySlotsList key={epoch.epoch} width={width} height={height} />
  ) : (
    <AllSlotsList key={epoch.epoch} width={width} height={height} />
  );
}

function InnerSlotsList({
  width,
  height,
  itemsCount,
  getSlotAtIndex,
  getIndexForSlot,
}: SlotsIndexProps & SlotsListProps) {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VirtuosoHandle>(null);
  const visibleStartIndexRef = useRef<number | null>(null);

  const [showPlaceholder, setShowPlaceholder] = useState(true);

  // Rows render in the mounting commit itself, already positioned at the
  // live slot (initialItemCount + initialScrollTop): no measure pass, no
  // post-mount scroll settle, no follower-frame pop-in. The whole first
  // frame pays for the rows, accepted so the page pops in as one piece.
  const [initialTopMostItemIndex] = useState(() => {
    const currentLeaderSlot = getDefaultStore().get(currentLeaderSlotAtom);
    const slotIndex =
      currentLeaderSlot === undefined
        ? undefined
        : getIndexForSlot(currentLeaderSlot);
    return slotIndex ? Math.max(0, slotIndex - slotsListPinnedSlotOffset) : 0;
  });
  const initialItemCount = Math.min(itemsCount, Math.ceil(height / 42) + 1);

  const setSlotOverride = useSetAtom(slotOverrideAtom);

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
          itemsCount - 1,
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
    itemsCount,
    visibleStartIndexRef,
  ]);

  const getItemContent = useCallback(
    (index: number) => {
      const leader = getSlotAtIndex(index);
      if (leader == null) return null;
      return <SlotsRenderer leaderSlotForGroup={leader} />;
    },
    [getSlotAtIndex],
  );

  const totalListHeightChanged = useCallback(
    (totalListHeight: number) => setShowPlaceholder(totalListHeight >= height),
    [height],
  );

  return (
    <Box
      ref={listContainerRef}
      position="relative"
      width={`${width}px`}
      height={`${height}px`}
    >
      <MRtAutoScroll listRef={listRef} getIndexForSlot={getIndexForSlot} />
      <MSlotOverrideScroll
        listRef={listRef}
        getIndexForSlot={getIndexForSlot}
        debouncedScroll={debouncedScroll}
      />
      {showPlaceholder && <MSlotsPlaceholder width={width} height={height} />}
      <ResetLive />
      <Virtuoso
        ref={listRef}
        className={styles.slotsList}
        width={width}
        height={height}
        totalCount={itemsCount}
        initialTopMostItemIndex={initialTopMostItemIndex}
        initialItemCount={initialItemCount}
        // estimate-consistent offset so the rows are on screen in the
        // mount paint, not after the async scroll-to-index settles
        initialScrollTop={initialTopMostItemIndex * 42}
        increaseViewportBy={increaseViewportBy}
        // height of past slots that the user is most likely to scroll through
        defaultItemHeight={42}
        skipAnimationFrameInResizeObserver
        computeItemKey={computeItemKey}
        itemContent={getItemContent}
        rangeChanged={rangeChanged}
        components={{ ScrollSeekPlaceholder: MScrollSeekPlaceHolder }}
        scrollSeekConfiguration={scrollSeekConfiguration}
        totalListHeightChanged={totalListHeightChanged}
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
  getIndexForSlot: (slot: number) => number | undefined;
}
const MRtAutoScroll = memo(function RTAutoScroll({
  listRef,
  getIndexForSlot,
}: RTAutoScrollProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const autoScroll = useAtomValue(autoScrollAtom);

  useEffect(() => {
    if (!autoScroll || currentLeaderSlot === undefined || !listRef.current)
      return;

    // scroll to new current leader slot
    const slotIndex = getIndexForSlot(currentLeaderSlot);
    const visibleStartIndex = slotIndex
      ? Math.max(0, slotIndex - slotsListPinnedSlotOffset)
      : 0;

    listRef.current.scrollToIndex({
      index: visibleStartIndex,
      align: "start",
    });
  }, [autoScroll, currentLeaderSlot, getIndexForSlot, listRef]);

  return null;
});

interface SlotOverrideScrollProps {
  listRef: RefObject<VirtuosoHandle>;
  getIndexForSlot: (slot: number) => number | undefined;
  debouncedScroll: DebouncedState<() => void>;
}
const MSlotOverrideScroll = memo(function SlotOverrideScroll({
  listRef,
  getIndexForSlot,
  debouncedScroll,
}: SlotOverrideScrollProps) {
  const rafIdRef = useRef<number | null>(null);
  const slotOverride = useAtomValue(slotOverrideAtom);

  useEffect(() => {
    if (
      slotOverride === undefined ||
      !listRef.current ||
      debouncedScroll.isPending()
    ) {
      return;
    }

    const slotIndex = getIndexForSlot(slotOverride);
    const targetIndex = slotIndex
      ? Math.max(0, slotIndex - slotsListPinnedSlotOffset)
      : 0;

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
});

function AllSlotsList({ width, height }: SlotsListProps) {
  const epoch = useAtomValue(epochAtom);

  const slotsListProps = useMemo(() => getAllSlotsListProps(epoch), [epoch]);

  if (!slotsListProps) return null;

  return <InnerSlotsList width={width} height={height} {...slotsListProps} />;
}

function MySlotsList({ width, height }: SlotsListProps) {
  const mySlots = useAtomValue(leaderSlotsAtom);

  const slotsListProps = useMemo(() => getMySlotsListProps(mySlots), [mySlots]);

  if (!slotsListProps) return null;

  if (slotsListProps.itemsCount === 0) {
    return (
      <Flex
        width={`${width}px`}
        height={`${height}px`}
        justify="center"
        align="center"
      >
        <Text className={styles.noSlotsText}>
          No Slots
          <br />
          Available
        </Text>
      </Flex>
    );
  }

  return <InnerSlotsList width={width} height={height} {...slotsListProps} />;
}
