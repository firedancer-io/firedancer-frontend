import { Flex } from "@radix-ui/themes";
import SlotPerformance from "../Overview/SlotPerformance";
import ComputeUnitsCard from "../Overview/SlotPerformance/ComputeUnitsCard";
import TransactionBarsCard from "../Overview/SlotPerformance/TransactionBarsCard";
import { useSlotSearchParam } from "./useSearchParams";
import { useAtomValue, useSetAtom } from "jotai";
import {
  selectedSlotAtom,
  baseSelectedSlotAtom,
} from "../Overview/SlotPerformance/atoms";
import { useEffect } from "react";
import { useUnmount } from "react-use";
import { epochAtom } from "../../atoms";
import { SlotSearch } from "./SlotSearch";
import SlotNavigation from "./SlotNavigation";
import DetailedSlotStats from "./DetailedSlotStats";

export default function SlotDetails() {
  const baseSelectedSlot = useAtomValue(baseSelectedSlotAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);

  return (
    <>
      <Setup />
      {!baseSelectedSlot.isInitialized ? null : selectedSlot === undefined ? (
        <SlotSearch />
      ) : (
        <SlotContent />
      )}
    </>
  );
}

function Setup() {
  const { selectedSlot } = useSlotSearchParam();
  const epoch = useAtomValue(epochAtom);
  const setBaseSelectedSlot = useSetAtom(baseSelectedSlotAtom);

  // To sync atom to search param
  useEffect(() => {
    setBaseSelectedSlot(selectedSlot, epoch);
  }, [selectedSlot, setBaseSelectedSlot, epoch]);

  useUnmount(() => {
    setBaseSelectedSlot(undefined);
  });

  return null;
}

function SlotContent() {
  const slot = useAtomValue(selectedSlotAtom);
  if (slot === undefined) return;

  return (
    <Flex direction="column" gap="2" flexGrow="1">
      <SlotNavigation />
      <DetailedSlotStats />
      <SlotPerformance />
      <ComputeUnitsCard />
      <TransactionBarsCard />
    </Flex>
  );
}
