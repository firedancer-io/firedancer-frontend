import { Flex } from "@radix-ui/themes";
import { useEffect, useMemo, useRef } from "react";

import Scrollbar from "./Scrollbar";
import SlotsList from "./SlotsList";
import { useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  epochAtom,
  setSlotScrollListFnAtom,
  slotOverrideAtom,
} from "../../atoms";
import {
  epochBarWidth,
  slotsListFutureSlotsCount,
  slotsListWidth,
  slotsPerLeader,
} from "../../consts";
import { StatusIndicator } from "./Status";
import AutoSizer from "react-virtualized-auto-sizer";
import { useCurrentRoute } from "../../hooks/useCurrentRoute";
import type { VirtuosoHandle } from "react-virtuoso";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";

export default function Navigation() {
  const currentRoute = useCurrentRoute();
  const width = useMemo(
    () =>
      `${currentRoute === "Schedule" ? epochBarWidth : epochBarWidth + slotsListWidth}px`,
    [currentRoute],
  );

  const epoch = useAtomValue(epochAtom);
  const listRef = useRef<VirtuosoHandle>(null);

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

  return (
    <Flex
      minWidth={width}
      maxWidth={width}
      height="100%"
      gap="1"
      overflow="hidden"
    >
      <HandleSlotOverride listRef={listRef} />
      <Flex height="100%" direction="column">
        <StatusIndicator />
        <Scrollbar />
      </Flex>
      <Flex width="100%" height="100%" pb="2">
        {currentRoute !== "Schedule" && (
          <AutoSizer>
            {({ height, width }) => (
              <SlotsList listRef={listRef} width={width} height={height} />
            )}
          </AutoSizer>
        )}
      </Flex>
    </Flex>
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
