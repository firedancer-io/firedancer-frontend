import { useAtomValue } from "jotai";
import {
  currentSlotAtom,
  epochAtom,
  isCurrentlyLeaderAtom,
  leaderSlotsAtom,
  nextLeaderSlotAtom,
  nextLeaderSlotIndexAtom,
  SlotNavFilter,
  slotNavFilterAtom,
} from "../../atoms";
import { Flex, Text } from "@radix-ui/themes";
import { memo, useMemo, type CSSProperties } from "react";
import styles from "./slotsList.module.css";
import ResetLive from "./ResetLive";
import VirtualSlotsList from "./VirtualSlotsList";
import { slotGroupCssVars, type SlotsIndexProps } from "./const";
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
  offsetHelpers,
}: SlotsIndexProps & SlotsListProps) {
  const style: CSSProperties = useMemo(() => {
    return {
      ...slotGroupCssVars,
      position: "relative",
      width,
      height,
    };
  }, [height, width]);

  return (
    <div style={style}>
      <ResetLive />
      <VirtualSlotsList
        visibleWidth={width}
        visibleHeight={height}
        itemsCount={itemsCount}
        getSlotAtIndex={getSlotAtIndex}
        getIndexForSlot={getIndexForSlot}
        offsetHelpers={offsetHelpers}
      />
    </div>
  );
});

const MAllSlotsList = memo(function AllSlotsList({
  width,
  height,
}: SlotsListProps) {
  const epoch = useAtomValue(epochAtom);
  const currentSlot = useAtomValue(currentSlotAtom);
  const leaderSlots = useAtomValue(leaderSlotsAtom);
  const nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);

  const slotsListProps = useMemo(
    () => getAllSlotsListProps(epoch, currentSlot, leaderSlots, nextLeaderSlot),
    [epoch, currentSlot, leaderSlots, nextLeaderSlot],
  );

  if (!slotsListProps) return null;

  return <MInnerSlotsList width={width} height={height} {...slotsListProps} />;
});

const MMySlotsList = memo(function MySlotsList({
  width,
  height,
}: SlotsListProps) {
  const mySlots = useAtomValue(leaderSlotsAtom);
  const currentSlot = useAtomValue(currentSlotAtom);
  const nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);
  const isCurrentlyLeader = useAtomValue(isCurrentlyLeaderAtom);
  const nextLeaderSlotIndex = useAtomValue(nextLeaderSlotIndexAtom);

  const slotsListProps = useMemo(
    () =>
      getMySlotsListProps(
        mySlots,
        currentSlot,
        nextLeaderSlot,
        isCurrentlyLeader,
        nextLeaderSlotIndex,
      ),
    [
      mySlots,
      currentSlot,
      nextLeaderSlot,
      isCurrentlyLeader,
      nextLeaderSlotIndex,
    ],
  );

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
