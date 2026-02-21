import { Flex } from "@radix-ui/themes";
import SlotPerformance from "../Overview/SlotPerformance";
import ComputeUnitsCard from "../Overview/SlotPerformance/ComputeUnitsCard";
import TransactionBarsCard from "../Overview/SlotPerformance/TransactionBarsCard";
import { useAtomValue } from "jotai";
import {
  baseSelectedSlotAtoms,
  selectedSlotAtom,
  SelectedSlotValidityState,
} from "../Overview/SlotPerformance/atoms";
import { SlotSearch } from "./SlotSearch";
import SlotNavigation from "./SlotNavigation";
import DetailedSlotStats from "./DetailedSlotStats";
import { useEffect, useState } from "react";
import ChartControlsProvider from "./ChartControlsProvider";

export default function SlotDetails() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const [waitedForDependencies, setWaitedForDependencies] = useState(false);
  const isNotReady =
    useAtomValue(baseSelectedSlotAtoms.state) ===
    SelectedSlotValidityState.NotReady;

  useEffect(() => {
    if (isNotReady && !waitedForDependencies) {
      const timeout = setTimeout(() => setWaitedForDependencies(true), 2_500);
      return () => clearTimeout(timeout);
    }
  }, [isNotReady, setWaitedForDependencies, waitedForDependencies]);

  // wait a bit for dependencies to load before showing SlotSearch with Not Ready error
  if (isNotReady && !waitedForDependencies) return null;

  return selectedSlot === undefined ? <SlotSearch /> : <SlotContent />;
}

function SlotContent() {
  const slot = useAtomValue(selectedSlotAtom);
  if (slot === undefined) return;

  return (
    <Flex direction="column" gap="2" flexGrow="1">
      <SlotNavigation />
      <ChartControlsProvider>
        <DetailedSlotStats />
        <SlotPerformance />
        <ComputeUnitsCard />
        <TransactionBarsCard />
      </ChartControlsProvider>
    </Flex>
  );
}
