import { useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  epochAtom,
  setSlotScrollListFnAtom,
  slotOverrideAtom,
} from "../../atoms";
import { Box } from "@radix-ui/themes";
import type React from "react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import styles from "./slotsList.module.css";
import { slotsListFutureSlotsCount, slotsPerLeader } from "../../consts";
import { throttle } from "lodash";
import SlotsRenderer, { SlotsPlaceholder } from "./SlotsRenderer";
import type { VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import ResetLive from "./ResetLive";

const computeItemKey = (slot: number) => slot;

export default function SlotsList({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VirtuosoHandle>(null);
  const visibleStartIndexRef = useRef<number | null>(null);

  const epoch = useAtomValue(epochAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const slotOverride = useAtomValue(slotOverrideAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);

  const setSlotScrollListFn = useSetAtom(setSlotScrollListFnAtom);
  useEffect(() => {
    setSlotScrollListFn((slot: number | undefined) => {
      if (!epoch || !listRef.current || !slot) return;
      const slotIndex = Math.trunc((epoch.end_slot - slot) / slotsPerLeader);
      listRef.current.scrollToIndex({
        index: slotIndex,
        align: "start",
      });
    });

    return () => {
      setSlotScrollListFn(undefined);
    };
  }, [epoch, setSlotScrollListFn]);

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
  const getIndexForSlot = useCallback(
    (slot: number) =>
      slotGroupsDescending.indexOf(
        Math.floor(slot / slotsPerLeader) * slotsPerLeader,
      ),
    [slotGroupsDescending],
  );

  // Determine initial scroll position
  const initialTopMostItemIndex = useMemo(() => {
    if (selectedSlot !== undefined) {
      const slotIndex = getIndexForSlot(selectedSlot);
      return slotIndex > 0 ? slotIndex - 1 : slotIndex;
    } else if (slotOverride !== undefined) {
      const slotIndex = getIndexForSlot(slotOverride);
      return slotIndex > 0 ? slotIndex - 1 : slotIndex;
    } else if (currentLeaderSlot !== undefined) {
      const slotIndex = getIndexForSlot(currentLeaderSlot);
      const visibleStartIndex = slotIndex - slotsListFutureSlotsCount;
      return visibleStartIndex > 0 ? visibleStartIndex : 0;
    }
    return -1;
  }, [selectedSlot, slotOverride, currentLeaderSlot, getIndexForSlot]);

  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const rangeChanged = useCallback(
    ({ startIndex }: { startIndex: number }) =>
      (visibleStartIndexRef.current = startIndex),
    [visibleStartIndexRef],
  );

  useEffect(() => {
    if (!listContainerRef.current) return;
    const container = listContainerRef.current;

    const handleSlotOverride = throttle(
      () => {
        if (visibleStartIndexRef.current === null) return;
        const slot = getSlotAtIndex(visibleStartIndexRef.current);
        setSlotOverride(
          slot ? slot + slotsListFutureSlotsCount : undefined,
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
        increaseViewportBy={{ top: 600, bottom: 600 }}
        // height of past slots that the user is most likely to scroll through
        defaultItemHeight={42}
        skipAnimationFrameInResizeObserver
        computeItemKey={computeItemKey}
        itemContent={(_, data) => <SlotsRenderer leaderSlotForGroup={data} />}
        rangeChanged={rangeChanged}
        components={{ ScrollSeekPlaceholder: MScrollSeekPlaceHolder }}
        scrollSeekConfiguration={{
          enter: (velocity) => Math.abs(velocity) > 1500,
          exit: (velocity) => Math.abs(velocity) < 500,
          change: (_, range) => rangeChanged(range),
        }}
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
    const slotIndex = Math.trunc(
      (epoch.end_slot - currentLeaderSlot) / slotsPerLeader,
    );
    const visibleStartIndex = slotIndex - slotsListFutureSlotsCount;
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

// Render nothing when scrolling quickly to improve performance
const MScrollSeekPlaceHolder = memo(function ScrollSeekPlaceholder() {
  return null;
});
