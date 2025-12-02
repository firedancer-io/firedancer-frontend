import { Flex } from "@radix-ui/themes";
import { SlotDetailsSection } from "../SlotDetailsSection";
import TxnExecutionDurationCharts from "./TxnExecutionDurationCharts";
import { TimeSinceLastLeaderStats } from "./TimeSinceLastLeaderStats";
import CpuSparklines from "./CpuSparklines";
import PackBufferChart from "./PackBufferChart";
import { SlotDurationStats } from "./SlotDurationStats";
import ScheduleStats from "./ScheduleStats";
import { sectionGapX, sectionGapY } from "../consts";

export default function PerformanceSection() {
  return (
    <SlotDetailsSection title="Performance" flexGrow="3">
      <Flex
        direction={{ xs: "row", initial: "column" }}
        gapX={sectionGapX}
        gapY={sectionGapY}
        flexGrow="1"
      >
        <Flex direction="column" gap={sectionGapY} flexBasis="0" flexGrow="1">
          <TimeSinceLastLeaderStats />
          <ScheduleStats />
          <PackBufferChart />
        </Flex>
        <Flex direction="column" gap={sectionGapY} flexBasis="0" flexGrow="1">
          <SlotDurationStats />
          <TxnExecutionDurationCharts />
          <CpuSparklines />
        </Flex>
      </Flex>
    </SlotDetailsSection>
  );
}
