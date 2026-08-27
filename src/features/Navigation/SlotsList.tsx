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
import type { ReactNode } from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./slotsList.module.css";
import { slotsListPinnedSlotOffset } from "../../consts";
import throttle from "lodash/throttle";
import SlotsRenderer, { MSlotsPlaceholder } from "./SlotsRenderer";
import ResetLive from "./ResetLive";
import type { DebouncedState } from "use-debounce";
import { useDebouncedCallback } from "use-debounce";
import {
  getAllSlotsListProps,
  getMySlotsListProps,
  type SlotsIndexProps,
} from "./utils";

const itemHeightPx = 42;

/** Rows rendered beyond each viewport edge. The row above absorbs the
 * one-row leader-rotation scroll before the window re-renders (the old
 * increaseViewportBy top: 24). */
const overscanRows = 1;

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

/**
 * Hand-rolled fixed-height (42px) window over the slot groups: a native
 * scroll container with a full-height spacer and the visible rows
 * absolutely positioned at their offsets. The initial window renders at
 * the followed leader group synchronously, so the real rows are in the
 * mounting commit itself -- no async init, no measure pass, no
 * static-overlay swap.
 */
function InnerSlotsList({
  width,
  height,
  itemsCount,
  getSlotAtIndex,
  getIndexForSlot,
}: SlotsIndexProps & SlotsListProps) {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const pinnedTopFor = useCallback(
    (slot: number | undefined) => {
      const slotIndex = slot === undefined ? undefined : getIndexForSlot(slot);
      const index = slotIndex
        ? Math.max(0, slotIndex - slotsListPinnedSlotOffset)
        : 0;
      return index * itemHeightPx;
    },
    [getIndexForSlot],
  );

  // Rows render in the mounting commit itself, already positioned at
  // the live slot: the whole first frame pays for the rows, accepted so
  // the page pops in as one piece
  const [scrollTop, setScrollTop] = useState(() => {
    const target = pinnedTopFor(getDefaultStore().get(currentLeaderSlotAtom));
    return Math.min(target, Math.max(0, itemsCount * itemHeightPx - height));
  });

  // position the scroller before first paint; the paint already shows
  // the matching window
  useLayoutEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollTop;
    // initial position only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Programmatic move: position the scroller AND render the target
  // window in the same commit, so far jumps (epoch slider) never paint
  // a blank frame. The follow-up native scroll event is a no-op render.
  const scrollToIndex = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = index * itemHeightPx;
    setScrollTop(scroller.scrollTop); // browser-clamped
  }, []);

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setScrollTop(scroller.scrollTop);
  }, []);

  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const debouncedScroll = useDebouncedCallback(() => {}, 100);

  // User scrolls (wheel/touch only -- native scrolls from follows don't
  // count) pin the list: override = slot at the pinned offset below the
  // first visible row
  useEffect(() => {
    const container = listContainerRef.current;
    if (!container) return;

    const handleSlotOverride = throttle(
      () => {
        const scroller = scrollerRef.current;
        if (!scroller) return;

        debouncedScroll();

        const slotIndex = Math.min(
          Math.round(scroller.scrollTop / itemHeightPx) +
            slotsListPinnedSlotOffset,
          itemsCount - 1,
        );

        const slot = getSlotAtIndex(slotIndex);
        setSlotOverride(slot);
      },
      50,
      { leading: true, trailing: true },
    );

    container.addEventListener("wheel", handleSlotOverride);
    container.addEventListener("touchmove", handleSlotOverride);

    return () => {
      handleSlotOverride.cancel();
      container.removeEventListener("wheel", handleSlotOverride);
      container.removeEventListener("touchmove", handleSlotOverride);
    };
  }, [getSlotAtIndex, debouncedScroll, setSlotOverride, itemsCount]);

  const winStart = Math.max(
    0,
    Math.floor(scrollTop / itemHeightPx) - overscanRows,
  );
  const winEnd = Math.min(
    itemsCount,
    Math.ceil((scrollTop + height) / itemHeightPx) + overscanRows,
  );
  const rows: ReactNode[] = [];
  for (let i = winStart; i < winEnd; i++) {
    const slot = getSlotAtIndex(i);
    if (slot == null) continue;
    rows.push(<SlotsRenderer key={slot} leaderSlotForGroup={slot} />);
  }

  const showPlaceholder = itemsCount * itemHeightPx >= height;

  return (
    <Box
      ref={listContainerRef}
      position="relative"
      width={`${width}px`}
      height={`${height}px`}
    >
      <MRtAutoScroll
        scrollToIndex={scrollToIndex}
        getIndexForSlot={getIndexForSlot}
      />
      <MSlotOverrideScroll
        scrollToIndex={scrollToIndex}
        getIndexForSlot={getIndexForSlot}
        debouncedScroll={debouncedScroll}
      />
      {showPlaceholder && <MSlotsPlaceholder width={width} height={height} />}
      <ResetLive />
      <div
        ref={scrollerRef}
        className={styles.slotsList}
        data-testid="slots-scroller"
        onScroll={handleScroll}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            height: `${itemsCount * itemHeightPx}px`,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: `${winStart * itemHeightPx}px`,
              left: 0,
              right: 0,
            }}
          >
            {rows}
          </div>
        </div>
      </div>
    </Box>
  );
}

interface RTAutoScrollProps {
  scrollToIndex: (index: number) => void;
  getIndexForSlot: (slot: number) => number | undefined;
}
const MRtAutoScroll = memo(function RTAutoScroll({
  scrollToIndex,
  getIndexForSlot,
}: RTAutoScrollProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const autoScroll = useAtomValue(autoScrollAtom);

  useEffect(() => {
    if (!autoScroll || currentLeaderSlot === undefined) return;

    // scroll to new current leader slot
    const slotIndex = getIndexForSlot(currentLeaderSlot);
    const visibleStartIndex = slotIndex
      ? Math.max(0, slotIndex - slotsListPinnedSlotOffset)
      : 0;

    scrollToIndex(visibleStartIndex);
  }, [autoScroll, currentLeaderSlot, getIndexForSlot, scrollToIndex]);

  return null;
});

interface SlotOverrideScrollProps {
  scrollToIndex: (index: number) => void;
  getIndexForSlot: (slot: number) => number | undefined;
  debouncedScroll: DebouncedState<() => void>;
}
const MSlotOverrideScroll = memo(function SlotOverrideScroll({
  scrollToIndex,
  getIndexForSlot,
  debouncedScroll,
}: SlotOverrideScrollProps) {
  const rafIdRef = useRef<number | null>(null);
  const slotOverride = useAtomValue(slotOverrideAtom);

  useEffect(() => {
    if (slotOverride === undefined || debouncedScroll.isPending()) {
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

      scrollToIndex(targetIndex);
    });

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [getIndexForSlot, slotOverride, scrollToIndex, debouncedScroll]);

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
