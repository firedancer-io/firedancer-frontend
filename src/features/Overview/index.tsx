import { Flex } from "@radix-ui/themes";
import TransactionsCard from "./TransactionsCard";
import SlotPerformance from "./SlotPerformance";
import ValidatorsCard from "./ValidatorsCard";
import SlotStatusCard from "./StatusCard";
import ComputeUnitsCard from "./SlotPerformance/ComputeUnitsCard";
import TransactionBarsCard from "./SlotPerformance/TransactionBarsCard";

export default function Overview() {
  return (
    <Flex direction="column" gap="4" flexGrow="1" flexShrink="1">
      <Flex gap="16px" align="stretch" wrap="wrap">
        <SlotStatusCard />
        <TransactionsCard />
        <ValidatorsCard />
      </Flex>
      <SlotPerformance />
      <ComputeUnitsCard />
      <TransactionBarsCard />
    </Flex>
  );
}
