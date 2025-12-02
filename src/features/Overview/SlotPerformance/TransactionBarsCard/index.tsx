import BarsChartContainer from "./BarsChartContainer";
import ChartTooltip from "./ChartTooltip";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../atoms";
import Card from "../../../../components/Card";
import { Text } from "@radix-ui/themes";

export default function TransactionsBarsCard() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(slot);
  if (!slot || !query.response?.transactions)
    return <TransactionsBarsCardPlaceholder />;

  return (
    <>
      <Card id="txn-bars-card">
        <BarsChartContainer />
      </Card>
      <ChartTooltip />
    </>
  );
}

function TransactionsBarsCardPlaceholder() {
  return (
    <Card
      style={{
        display: "flex",
        flexGrow: "1",
        height: "400px",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Loading Banks...</Text>
    </Card>
  );
}
