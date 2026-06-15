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
  if (!slot || !query.response?.transactions) {
    // Per-transaction data expires server-side; stop the spinner once resolved.
    if (query.hasWaitedForData) return <TransactionsBarsCardUnavailable />;
    return <TransactionsBarsCardPlaceholder />;
  }

  return (
    <>
      <Card id="txn-bars-card">
        <BarsChartContainer key={slot} />
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

function TransactionsBarsCardUnavailable() {
  return (
    <Card
      style={{
        display: "flex",
        flexGrow: "1",
        height: "400px",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <Text color="gray">
        Per-transaction data is no longer retained for this slot.
      </Text>
    </Card>
  );
}
