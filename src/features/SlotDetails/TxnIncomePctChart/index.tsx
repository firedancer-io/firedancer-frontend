import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import TxnIncomePctBarChart from "./TxnIncomePctBarChart";
import { Flex, Text } from "@radix-ui/themes";

export default function TxnIncomePctChart() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(slot);

  if (!query.response?.transactions) return null;

  return (
    <>
      <Flex direction="column" style={{marginBottom: "-4px"}}>
        <Text style={{ color: "var(--gray-12)" }}>Income Percentiles</Text>
      </Flex>
      <Flex
        direction="column"
        // gap="1"
        style={{ width: "95%", maxWidth: "600px" }}
      >
        <TxnIncomePctBarChart slotTransactions={query.response.transactions} />
      </Flex>
    </>
  );
}
