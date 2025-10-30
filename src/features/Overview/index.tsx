import { Flex } from "@radix-ui/themes";
import TransactionsCard from "./TransactionsCard";
import SlotPerformance from "./SlotPerformance";
import ValidatorsCard from "./ValidatorsCard";
import SlotStatusCard from "./StatusCard";
import EpochCard from "./EpochCard";
import ShredsProgression from "./ShredsProgression";

export default function Overview() {
  return (
    <Flex direction="column" gap="4" flexGrow="1">
      <ShredsProgression
        title="Shreds Progression"
        chartHeight={400}
        pauseDuringStartup
      />
      <Flex gap="16px" align="stretch" wrap="wrap">
        <EpochCard />
        <SlotStatusCard />
        <ValidatorsCard />
        <TransactionsCard />
      </Flex>
      <SlotPerformance />
    </Flex>
  );
}
