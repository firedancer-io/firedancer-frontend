import { Flex } from "@radix-ui/themes";
import { SlotDetailsSection } from "../SlotDetailsSection";
import ComputeUnitStats from "./ComputeUnitStats";
import ProtocolLimitStats from "./ProtocolLimitStats";
import BusyAccounts from "./BusyAccounts";
import CumulativeExecutionTimeStats from "./CumulativeExecutionTimeStats";
import ExecutionTime from "./ExecutionTime";

export default function ComputeSection() {
  return (
    <SlotDetailsSection title="Compute">
      <Flex direction="column" gap="3">
        <ComputeUnitStats />
        <ProtocolLimitStats />
        <BusyAccounts />
        <CumulativeExecutionTimeStats />
        <ExecutionTime />
      </Flex>
    </SlotDetailsSection>
  );
}
