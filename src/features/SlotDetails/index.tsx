import { Flex } from "@radix-ui/themes";
import SlotPerformance from "../Overview/SlotPerformance";
import ComputeUnitsCard from "../Overview/SlotPerformance/ComputeUnitsCard";
import TransactionBarsCard from "../Overview/SlotPerformance/TransactionBarsCard";
import { Setup } from "../Overview";

export default function SlotDetails() {
  return (
    <Flex direction="column" gap="4">
      <Setup />
      <SlotPerformance />
      <ComputeUnitsCard />
      <TransactionBarsCard />
    </Flex>
  );
}
