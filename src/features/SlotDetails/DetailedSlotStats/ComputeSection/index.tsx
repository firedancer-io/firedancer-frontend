import { Flex } from "@radix-ui/themes";
import { Section } from "../StatSection";
import ComputeUnitStats from "./ComputeUnitStats";
import ProtocolLimitStats from "./ProtocolLimitStats";
import BusyAccounts from "./BusyAccounts";
import AccountDataStats from "./AccountDataStats";
import CumulativeExecutionTimeStats from "./CumulativeExecutionTimeStats";
import TxnAvgDurations from "../TimingStats/TxnAvgDurations";

export default function ComputeSection() {
  return (
    <Section title="Compute">
      <Flex direction="column" gap="3">
        <ComputeUnitStats />
        <ProtocolLimitStats />
        <BusyAccounts />
        <AccountDataStats />
        <CumulativeExecutionTimeStats />
        <TxnAvgDurations />
      </Flex>
    </Section>
  );
}
