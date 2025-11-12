import { Flex } from "@radix-ui/themes";
import { SlotDetailsSection } from "../SlotDetailsSection";
import TxnExecutionDurationCharts from "./TxnExecutionDurationCharts";
import { TimeSinceLastLeaderStats } from "./TimeSinceLastLeaderStats";
import CpuSparklines from "./CpuSparklines";
import PackBufferChart from "./PackBufferChart";
import { SlotDurationStats } from "./SlotDurationStats";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import ScheduleOutcomes from "./ScheduleOutcomes";

export default function PerformanceSection() {
  return (
    <SlotDetailsSection title="Performance" flexGrow="1.5">
      <Flex gap="2">
        <SlotDetailsSubSection title="Scheduler" gap="3" flexGrow="1">
          <TimeSinceLastLeaderStats />
          <ScheduleOutcomes />
          <PackBufferChart />
        </SlotDetailsSubSection>
        <Flex direction="column" gap="3" flexGrow="1">
          <SlotDurationStats />
          <TxnExecutionDurationCharts />
          <CpuSparklines />
        </Flex>
      </Flex>
    </SlotDetailsSection>
  );
}
