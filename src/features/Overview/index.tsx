import { Flex } from "@radix-ui/themes";
import TransactionsCard from "./TransactionsCard";
import SlotPerformance from "./SlotPerformance";
import ValidatorsCard from "./ValidatorsCard";
import SlotStatusCard from "./StatusCard";
import EpochCard from "./EpochCard";

export default function Overview() {
  return (
    <Flex direction="column" gap="4" flexGrow="1">
      <Flex gap="16px" align="stretch" wrap="wrap">
        <EpochCard />
        <SlotStatusCard />
        <TransactionsCard />
        <ValidatorsCard />
      </Flex>
      <SlotPerformance />
    </Flex>
  );
}
