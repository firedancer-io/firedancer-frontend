import { Flex } from "@radix-ui/themes";
import { Section } from "../StatSection";
import FeeBreakdownStats from "./FeeBreakdownStats";
import IncomeDistributionCharts from "./IncomeDistributionCharts";
import IncomeScatterCharts from "./IncomeScatterCharts";

export default function FeeSection() {
  return (
    <Section title="Fees">
      <Flex direction="column" gap="3" height="100%">
        <FeeBreakdownStats />
        <IncomeDistributionCharts />
        <IncomeScatterCharts />
      </Flex>
    </Section>
  );
}
