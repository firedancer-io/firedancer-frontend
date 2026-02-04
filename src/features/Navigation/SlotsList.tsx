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
import { Box, Flex, Text } from "@radix-ui/themes";
import type { RefObject } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./slotsList.module.css";
import { slotsListPinnedSlotOffset } from "../../consts";
import { throttle } from "lodash";
import SlotsRenderer, { SlotsPlaceholder } from "./SlotsRenderer";
import type { ScrollSeekConfiguration, VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import ResetLive from "./ResetLive";
import type { DebouncedState } from "use-debounce";
import { useDebouncedCallback } from "use-debounce";
import clsx from "clsx";
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

  const [hideList, setHideList] = useState(true);
  const [totalListHeight, setTotalListHeight] = useState(0);

  useEffect(() => {
    // initially hide list to
    const timeout = setTimeout(() => {
      setHideList(false);
    }, 100);

    return () => clearTimeout(timeout);
  }, []);

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
      <SlotsPlaceholder
        width={width}
        height={height}
        totalListHeight={totalListHeight}
      />
      <ResetLive />
      <Virtuoso
        ref={listRef}
        className={clsx(styles.slotsList, { [styles.hidden]: hideList })}
        width={width}
        height={height}
        totalCount={itemsCount}
        increaseViewportBy={increaseViewportBy}
        // height of past slots that the user is most likely to scroll through
        defaultItemHeight={42}
        skipAnimationFrameInResizeObserver
        computeItemKey={computeItemKey}
        itemContent={getItemContent}
        rangeChanged={rangeChanged}
        components={{ ScrollSeekPlaceholder: MScrollSeekPlaceHolder }}
        scrollSeekConfiguration={scrollSeekConfiguration}
        totalListHeightChanged={(height) => setTotalListHeight(height)}
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
function RTAutoScroll({ listRef, getIndexForSlot }: RTAutoScrollProps) {
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
}

interface SlotOverrideScrollProps {
  listRef: RefObject<VirtuosoHandle>;
  getIndexForSlot: (slot: number) => number | undefined;
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
}

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
