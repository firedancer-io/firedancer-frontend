import { useAtomValue } from "jotai";
import {
  epochAtom,
  leaderSlotsAtom,
  SlotNavFilter,
  slotNavFilterAtom,
} from "../../atoms";
import { Flex, Text } from "@radix-ui/themes";
import { memo, useMemo } from "react";
import styles from "./slotsList.module.css";
import ResetLive from "./ResetLive";
import VirtualSlotsList from "./VirtualSlotsList";
import type { SlotsIndexProps } from "./const";
import { getAllSlotsListProps } from "./allSlotsUtils";
import { getMySlotsListProps } from "./mySlotsUtils";

interface SlotsListProps {
  width: number;
  height: number;
}

export default function SlotsList({ width, height }: SlotsListProps) {
  const navFilter = useAtomValue(slotNavFilterAtom);
  const epoch = useAtomValue(epochAtom);

  if (!epoch) return null;

  return navFilter === SlotNavFilter.MySlots ? (
    <MMySlotsList key={epoch.epoch} width={width} height={height} />
  ) : (
    <MAllSlotsList key={epoch.epoch} width={width} height={height} />
  );
}

const MInnerSlotsList = memo(function InnerSlotsList({
  width,
  height,
  itemsCount,
  getSlotAtIndex,
  getIndexForSlot,
  getOffsetHelpers,
}: SlotsIndexProps & SlotsListProps) {
  return (
    <div style={{ position: "relative", width, height }}>
      <ResetLive />
      <VirtualSlotsList
        visibleWidth={width}
        visibleHeight={height}
        itemsCount={itemsCount}
        getSlotAtIndex={getSlotAtIndex}
        getIndexForSlot={getIndexForSlot}
        getOffsetHelpers={getOffsetHelpers}
      />
    </div>
  );
});

const MAllSlotsList = memo(function AllSlotsList({
  width,
  height,
}: SlotsListProps) {
  const epoch = useAtomValue(epochAtom);

  const slotsListProps = useMemo(() => getAllSlotsListProps(epoch), [epoch]);

  if (!slotsListProps) return null;

  return <MInnerSlotsList width={width} height={height} {...slotsListProps} />;
});

const MMySlotsList = memo(function MySlotsList({
  width,
  height,
}: SlotsListProps) {
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

  return <MInnerSlotsList width={width} height={height} {...slotsListProps} />;
});
