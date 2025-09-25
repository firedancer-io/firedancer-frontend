import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import CuIncomeScatterChart from "./CuIncomeScatterChart";
import { Text } from "@radix-ui/themes";

export default function CuIncomeChart() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(slot);

  if (!query.response?.transactions) return null;

  return (
    <div style={{ height: "100%", width: "100%", minHeight: "300px", minWidth: "200px" }}>
      <Text>Cu to Income</Text>
      <CuIncomeScatterChart slotTransactions={query.response.transactions} />
    </div>
  );
}
