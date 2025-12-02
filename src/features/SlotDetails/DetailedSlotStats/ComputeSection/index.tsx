import { SlotDetailsSection } from "../SlotDetailsSection";
import ComputeUnitStats from "./ComputeUnitStats";
import ProtocolLimitStats from "./ProtocolLimitStats";
import BusyAccounts from "./BusyAccounts";
import CumulativeExecutionTimeStats from "./CumulativeExecutionTimeStats";
import ExecutionTime from "./ExecutionTime";

export default function ComputeSection() {
  return (
    <SlotDetailsSection title="Compute" flexGrow="2">
      <ProtocolLimitStats />
      <ComputeUnitStats />
      <BusyAccounts />
      <CumulativeExecutionTimeStats />
      <ExecutionTime />
    </SlotDetailsSection>
  );
}
