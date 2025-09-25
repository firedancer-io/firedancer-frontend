import { Flex } from "@radix-ui/themes";
import { Section } from "../StatSection";
import TxnExecutionDurationCharts from "./TxnExecutionDurationCharts";
import { TimeSinceLastLeaderStats } from "./TimeSinceLastLeaderStats";
import CpuSparklines from "./CpuSparklines";
import PackBufferChart from "./PackBufferChart";
import { SlotDurationStats } from "./SlotDurationStats";

export default function PerformanceSection() {
  return (
    <Section title="Performance">
      <Flex gap="2">
        <Flex direction="column" gap="3">
          <TimeSinceLastLeaderStats />
          <PackBufferChart />
        </Flex>
        <Flex direction="column" gap="3" flexGrow="1">
          <SlotDurationStats />
          <TxnExecutionDurationCharts />
          <CpuSparklines />
        </Flex>
      </Flex>
    </Section>
  );
}
