import { Flex } from "@radix-ui/themes";
import { SlotDetailsSection } from "../SlotDetailsSection";
import FeeBreakdownStats from "./FeeBreakdownStats";
import IncomeDistributionCharts from "./IncomeDistributionCharts";
import IncomeScatterCharts from "./IncomeScatterCharts";

export default function FeeSection() {
  return (
    <SlotDetailsSection title="Fees">
      <Flex direction="column" gap="3" flexGrow="1">
        <FeeBreakdownStats />
        <IncomeDistributionCharts />
        <IncomeScatterCharts />
      </Flex>
    </SlotDetailsSection>
  );
}
