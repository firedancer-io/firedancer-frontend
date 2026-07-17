import { useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  slotOverrideAtom,
} from "../../atoms";
import type { PropsWithChildren, RefObject } from "react";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { throttle } from "lodash";
import { MSlotsPlaceholder } from "./SlotsRenderer";
import {
  useDebouncedCallback,
  useThrottledCallback,
  type DebouncedState,
} from "use-debounce";
import {
  type ItemInfo,
  filterStillVisibleItems,
  addVisibleItemsBelow,
  getInitialVisibleItems,
  addVisibleItemsAbove,
  type OffsetHelpers,
} from "./utils";
import { MItems } from "./ListItem";

const noop = () => {};

const SCROLL_THROTTLE = 50;

interface VirtualSlotsListProps {
  visibleWidth: number;
  visibleHeight: number;
  offsetHelpers: OffsetHelpers;
  heightDeltas: Map<number, number> | undefined;
}

export default function VirtualSlotsList({
  visibleWidth,
  visibleHeight,
  offsetHelpers,
  heightDeltas,
}: VirtualSlotsListProps) {
  const visibleItemsRef = useRef<{
    currentSlot: number;
    yourNextLeaderSlot: number | undefined;
    items: ItemInfo[];
  }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState<number | undefined>();

  const throttledSetScrollTop = useThrottledCallback(
    (value: number) => {
      setScrollTop(value);
    },
    SCROLL_THROTTLE,
    { trailing: true },
  );

  if (scrollTop != null && offsetHelpers != null && containerRef.current) {
    const endVisibleOffset = scrollTop + visibleHeight;
    const setVisibleItems = (
      value: NonNullable<typeof visibleItemsRef.current>,
    ) => {
      visibleItemsRef.current = value;
    };

    if (visibleItemsRef.current && heightDeltas && containerRef.current) {
      const topItem = visibleItemsRef.current.items[0];
      const prevTopOffset = topItem.topOffset;
      // if visible items are still in the visible range, use those
      if (heightDeltas.size) {
        const heightDeltaEntries = [...heightDeltas.entries()];
        for (const item of visibleItemsRef.current.items) {
          offsetHelpers.updateItem(
            item,
            heightDeltaEntries,
            offsetHelpers.offsetSnapshotCurrentSlot,
          );
        }
      }

      const topOffsetDelta = topItem.topOffset - prevTopOffset;
      const elScrollTop = containerRef.current.scrollTop;
      const effectiveScrollTop = elScrollTop + topOffsetDelta;
      const effectiveEndVisibleOffset = effectiveScrollTop + visibleHeight;

      // scroll to prevent visual shift if only the area above visible window grew
      if (topOffsetDelta) {
        containerRef.current.scrollTop = effectiveScrollTop;
        setScrollTop(effectiveScrollTop);
      }

      const visibleItems = filterStillVisibleItems(
        visibleItemsRef.current.items,
        effectiveScrollTop,
        visibleHeight,
      );

      if (visibleItems.length) {
        const prevItem = offsetHelpers.getItemAbove(visibleItems[0]);
        addVisibleItemsAbove(
          prevItem,
          visibleItems,
          effectiveScrollTop,
          offsetHelpers.getItemAbove,
        );

        const nextItem = offsetHelpers.getItemBelow(
          visibleItems[visibleItems.length - 1],
        );
        addVisibleItemsBelow(
          nextItem,
          visibleItems,
          effectiveEndVisibleOffset,
          offsetHelpers.getItemBelow,
        );

        setVisibleItems({
          currentSlot: offsetHelpers.offsetSnapshotCurrentSlot,
          yourNextLeaderSlot: offsetHelpers.yourNextLeaderSlot,
          items: visibleItems,
        });
      } else {
        const visibleItems = getInitialVisibleItems(
          effectiveScrollTop,
          endVisibleOffset,
          offsetHelpers.getItemBelow,
          offsetHelpers.getFirstVisibleItem,
        );
        if (!visibleItems.length) {
          visibleItemsRef.current = undefined;
        } else {
          setVisibleItems({
            currentSlot: offsetHelpers.offsetSnapshotCurrentSlot,
            yourNextLeaderSlot: offsetHelpers.yourNextLeaderSlot,
            // topOffsetRange: visibleItems.length ? visibleItems[0].topOffset, visibleItems[] : undefined
            items: visibleItems,
          });
        }
      }
    } else {
      const visibleItems = getInitialVisibleItems(
        scrollTop,
        endVisibleOffset,
        offsetHelpers.getItemBelow,
        offsetHelpers.getFirstVisibleItem,
      );
      if (!visibleItems.length) {
        visibleItemsRef.current = undefined;
      } else {
        setVisibleItems({
          currentSlot: offsetHelpers.offsetSnapshotCurrentSlot,
          yourNextLeaderSlot: offsetHelpers.yourNextLeaderSlot,
          items: visibleItems,
        });
      }
    }

    heightDeltas?.clear();
  }

  const getPaddedSlotTopOffsetRef = useRef<
    (slot: number) => number | undefined
  >(() => undefined);
  const getPaddedSlotAtOffsetRef = useRef<
    (offset: number) => number | undefined
  >(() => undefined);

  getPaddedSlotTopOffsetRef.current = (slot: number) => {
    return offsetHelpers?.getPaddedSlotTopOffset(slot);
  };

  if (!offsetHelpers) return;

  const { totalHeight, getPaddedSlotAtOffset } = offsetHelpers;

  getPaddedSlotAtOffsetRef.current = getPaddedSlotAtOffset;

  return (
    <>
      {totalHeight >= visibleHeight && (
        <MSlotsPlaceholder width={visibleWidth} height={visibleHeight} />
      )}
      <MScrollContainer
        width={visibleWidth}
        height={visibleHeight}
        containerRef={containerRef}
        onScrollTopChange={throttledSetScrollTop}
        getPaddedSlotTopOffsetRef={getPaddedSlotTopOffsetRef}
        getPaddedSlotAtOffsetRef={getPaddedSlotAtOffsetRef}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {visibleItemsRef.current != null && (
            <MItems visibleItems={visibleItemsRef.current.items} />
          )}
        </div>
      </MScrollContainer>
    </>
  );
}

interface ScrollContainerProps {
  width: number;
  height: number;
  containerRef: RefObject<HTMLDivElement>;
  getPaddedSlotTopOffsetRef: RefObject<(slot: number) => number | undefined>;
  getPaddedSlotAtOffsetRef: RefObject<(offset: number) => number | undefined>;
  onScrollTopChange: (scrollTop: number) => void;
}
const MScrollContainer = memo(function ScrollContainer({
  width,
  height,
  containerRef,
  getPaddedSlotTopOffsetRef: refreshAndGetPaddedSlotTopOffsetRef,
  getPaddedSlotAtOffsetRef,
  onScrollTopChange,
  children,
}: PropsWithChildren<ScrollContainerProps>) {
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  /** prevent auto scroll during manual scroll */
  const isManualScrolling = useDebouncedCallback(noop, 100);

  // Track scrollTop
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = () => {
      onScrollTopChange(el.scrollTop);
    };
    el.addEventListener("scroll", handler, { passive: true });

    return () => el.removeEventListener("scroll", handler);
  }, [containerRef, onScrollTopChange]);

  const scrollToSlotPinnedPosition = useCallback(
    (slot: number) => {
      const el = containerRef.current;
      if (!el) return;

      const offset = refreshAndGetPaddedSlotTopOffsetRef.current?.(slot);
      if (offset == null) return;

      el.scrollTop = offset;
    },
    [containerRef, refreshAndGetPaddedSlotTopOffsetRef],
  );

  // Handle manual sroll
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSlotOverride = throttle(
      () => {
        isManualScrolling();

        const slot = getPaddedSlotAtOffsetRef.current?.(container.scrollTop);
        if (slot == null) return;

        setSlotOverride(slot);
      },
      50,
      { leading: true, trailing: true },
    );

    container.addEventListener("wheel", updateSlotOverride);
    container.addEventListener("touchmove", updateSlotOverride);

    return () => {
      container.removeEventListener("wheel", updateSlotOverride);
      container.removeEventListener("touchmove", updateSlotOverride);
      updateSlotOverride.cancel();
    };
  }, [
    containerRef,
    isManualScrolling,
    getPaddedSlotAtOffsetRef,
    setSlotOverride,
  ]);

  return (
    <>
      <MRtAutoScroll scrollToSlotPinnedPosition={scrollToSlotPinnedPosition} />
      <MScrollToSlotOverride
        scrollToSlotPinnedPosition={scrollToSlotPinnedPosition}
        isManualScrolling={isManualScrolling}
      />
      <div
        ref={containerRef}
        style={{
          width,
          height,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "none",
          position: "relative",
        }}
      >
        {children}
      </div>
    </>
  );
});

interface RTAutoScrollProps {
  scrollToSlotPinnedPosition: (slot: number) => void;
}
const MRtAutoScroll = memo(function RTAutoScroll({
  scrollToSlotPinnedPosition,
}: RTAutoScrollProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const autoScroll = useAtomValue(autoScrollAtom);

  useLayoutEffect(() => {
    if (!autoScroll || currentLeaderSlot === undefined) return;
    scrollToSlotPinnedPosition(currentLeaderSlot);
  }, [autoScroll, currentLeaderSlot, scrollToSlotPinnedPosition]);

  return null;
});

interface SlotOverrideScrollProps {
  isManualScrolling: DebouncedState<() => void>;
  scrollToSlotPinnedPosition: (slot: number) => void;
}
const MScrollToSlotOverride = memo(function SlotOverrideScroll({
  isManualScrolling,
  scrollToSlotPinnedPosition,
}: SlotOverrideScrollProps) {
  const rafIdRef = useRef<number | null>(null);
  const slotOverride = useAtomValue(slotOverrideAtom);

  useLayoutEffect(() => {
    if (slotOverride === undefined || isManualScrolling.isPending()) {
      return;
    }

    rafIdRef.current = requestAnimationFrame(() => {
      scrollToSlotPinnedPosition(slotOverride);
    });

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isManualScrolling, scrollToSlotPinnedPosition, slotOverride]);

  return null;
});
