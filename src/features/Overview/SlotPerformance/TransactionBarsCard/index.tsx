import BarsChartContainer from "./BarsChartContainer";
import { Card } from "@radix-ui/themes";
import ChartTooltip from "./ChartTooltip";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../atoms";

export default function TransactionsBarsCard() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(slot);
  if (!slot || !query.response?.transactions) return null;

  return (
    <>
      <Card
        style={{
          marginTop: "8px",
          // contain paint and position relative messes with chart tooltip
          // contain: "inherit",
          // position: "inherit",
        }}
        id="txn-bars-card"
      >
        <BarsChartContainer />
      </Card>
      <ChartTooltip />
    </>
  );
}
