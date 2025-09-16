import BarsChartContainer from "./BarsChartContainer";
import ChartTooltip from "./ChartTooltip";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../atoms";
import Card from "../../../../components/Card";

export default function TransactionsBarsCard() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(slot);
  if (!slot || !query.response?.transactions) return null;

  return (
    <>
      <Card id="txn-bars-card">
        <BarsChartContainer />
      </Card>
      <ChartTooltip />
    </>
  );
}
