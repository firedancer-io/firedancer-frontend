import { SlotDetailsSection } from "../SlotDetailsSection";
import FeeBreakdownStats from "./FeeBreakdownStats";
import IncomeDistributionCharts from "./IncomeDistributionCharts";
import IncomeScatterCharts from "./IncomeScatterCharts";

export default function FeeSection() {
  return (
    <SlotDetailsSection title="Fees" flexGrow="2">
      <FeeBreakdownStats />
      <IncomeDistributionCharts />
      <IncomeScatterCharts />
    </SlotDetailsSection>
  );
}
