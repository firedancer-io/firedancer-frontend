import { useAtomValue } from "jotai";
import {
  ascendingLeaderSlotsSetAtom,
  currentLeaderSlotAtom,
  epochAtom,
  isCurrentlyLeaderAtom,
  leaderSlotsAtom,
  nextLeaderSlotAtom,
  nextLeaderSlotIndexAtom,
  SlotNavFilter,
  slotNavFilterAtom,
  yourLeaderSlotCountsAtom,
} from "../../atoms";
import { Flex, Text } from "@radix-ui/themes";
import { memo, useMemo, type CSSProperties } from "react";
import styles from "./slotsList.module.css";
import ResetLive from "./ResetLive";
import VirtualSlotsList from "./VirtualSlotsList";
import { slotGroupCssVars, type SlotsIndexProps } from "./const";
import { getAllSlotsListProps } from "./allSlotsUtils";
import { getMySlotsListProps } from "./mySlotsUtils";
import { useHeightDeltas } from "./useHeightDeltas";
import { getOffsetHelpers, type OffsetHelpers } from "./utils";

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

interface InnerSlotsListProps {
  heightDeltas: Map<number, number> | undefined;
}
const MInnerSlotsList = memo(function InnerSlotsList({
  width,
  height,
  heightDeltas,
  itemsCount,
  getSlotAtIndex,
  getIndexForSlot,
  listHelpers,
}: InnerSlotsListProps & SlotsIndexProps & SlotsListProps) {
  const style: CSSProperties = useMemo(() => {
    return {
      ...slotGroupCssVars,
      position: "relative",
      width,
      height,
    };
  }, [height, width]);

  const offsetHelpers: OffsetHelpers = useMemo(
    () =>
      getOffsetHelpers(
        listHelpers,
        getIndexForSlot,
        getSlotAtIndex,
        itemsCount,
      ),
    [listHelpers, getIndexForSlot, getSlotAtIndex, itemsCount],
  );

  return (
    <div style={style}>
      <ResetLive />
      <VirtualSlotsList
        visibleWidth={width}
        visibleHeight={height}
        offsetHelpers={offsetHelpers}
        heightDeltas={heightDeltas}
      />
    </div>
  );
});

const MAllSlotsList = memo(function AllSlotsList({
  width,
  height,
}: SlotsListProps) {
  const epoch = useAtomValue(epochAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const ascendingLeaderSlotsSet = useAtomValue(ascendingLeaderSlotsSetAtom);
  const nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);
  const yourLeaderSlotCounts = useAtomValue(yourLeaderSlotCountsAtom);

  const slotsListProps = useMemo(
    () =>
      getAllSlotsListProps(
        epoch,
        currentLeaderSlot,
        ascendingLeaderSlotsSet,
        nextLeaderSlot,
        yourLeaderSlotCounts,
      ),
    [
      epoch,
      currentLeaderSlot,
      ascendingLeaderSlotsSet,
      nextLeaderSlot,
      yourLeaderSlotCounts,
    ],
  );

  const heightDeltas = useHeightDeltas(
    false,
    currentLeaderSlot,
    slotsListProps?.listHelpers?.yourNextLeaderSlot,
    ascendingLeaderSlotsSet,
  );

  if (!slotsListProps) return null;

  return (
    <MInnerSlotsList
      width={width}
      height={height}
      {...slotsListProps}
      heightDeltas={heightDeltas?.slotHeightDeltas}
    />
  );
});

const MMySlotsList = memo(function MySlotsList({
  width,
  height,
}: SlotsListProps) {
  const mySlots = useAtomValue(leaderSlotsAtom);
  const ascendingLeaderSlotsSet = useAtomValue(ascendingLeaderSlotsSetAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);
  const isCurrentlyLeader = useAtomValue(isCurrentlyLeaderAtom);
  const nextLeaderSlotIndex = useAtomValue(nextLeaderSlotIndexAtom);
  const yourLeaderSlotCounts = useAtomValue(yourLeaderSlotCountsAtom);

  const slotsListProps = useMemo(
    () =>
      getMySlotsListProps(
        mySlots,
        ascendingLeaderSlotsSet,
        currentLeaderSlot,
        nextLeaderSlot,
        isCurrentlyLeader,
        nextLeaderSlotIndex,
        yourLeaderSlotCounts,
      ),
    [
      mySlots,
      ascendingLeaderSlotsSet,
      currentLeaderSlot,
      nextLeaderSlot,
      isCurrentlyLeader,
      nextLeaderSlotIndex,
      yourLeaderSlotCounts,
    ],
  );

  const heightDeltas = useHeightDeltas(
    true,
    currentLeaderSlot,
    slotsListProps?.listHelpers?.yourNextLeaderSlot,
    ascendingLeaderSlotsSet,
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

  return (
    <MInnerSlotsList
      width={width}
      height={height}
      {...slotsListProps}
      heightDeltas={heightDeltas?.slotHeightDeltas}
    />
  );
});
