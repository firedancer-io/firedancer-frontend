import { useAtomValue, useSetAtom } from "jotai";
import {
  currentLeaderSlotAtom,
  epochAtom,
  slotOverrideAtom,
} from "../../atoms";
import { Box } from "@radix-ui/themes";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import styles from "./slotsList.module.css";
import { slotsListFutureSlotsCount, slotsPerLeader } from "../../consts";
import { throttle } from "lodash";
import { SlotsRenderer, SlotsPlaceholder } from "./SlotsRenderer";
import type { VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import ResetLive from "./ResetLive";

export default function SlotsList({
  listRef,
  width,
  height,
}: {
  listRef: React.RefObject<VirtuosoHandle>;
  width: number;
  height: number;
}) {
  const listContainerRef = useRef<HTMLDivElement>(null);
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
      return slotIndex;
    } else if (slotOverride !== undefined) {
      const slotIndex = getIndexForSlot(slotOverride);
      return slotIndex;
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
        overscan={2}
        itemContent={(_, data) => <SlotsRenderer leaderSlotForGroup={data} />}
        rangeChanged={rangeChanged}
        components={{ ScrollSeekPlaceholder }}
        scrollSeekConfiguration={{
          enter: (velocity) => Math.abs(velocity) > 1500,
          exit: (velocity) => Math.abs(velocity) < 500,
          change: (_, range) => rangeChanged(range),
        }}
      />
    </Box>
  );
}

// Render nothing when scrolling quickly to improve performance
function ScrollSeekPlaceholder() {
  return null;
}
