import { Flex, Text } from "@radix-ui/themes";
import TxnIncomePctBarChart from "../../TxnIncomePctChart/TxnIncomePctBarChart";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import IncomeByTxn from "./IncomeByTxn";
import IncomeByIp from "./IncomeByIp";
import IncomeByBundle from "./IncomeByBundle";
import IncomeByPctTxns from "./IncomeByPctTxns";

export default function IncomeDistributionCharts() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const transactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;

  if (!transactions) return;

  return (
    <Flex direction="column" gap="2">
      {/* <Text style={{ color: "var(--gray-12)" }}>
        Income Distribution by count
      </Text>
      <Flex
        direction="column"
        // gap="1"
        style={{ width: "95%", maxWidth: "600px" }}
      >
        <TxnIncomePctBarChart slotTransactions={transactions} />
      </Flex> */}
      <IncomeByPctTxns transactions={transactions} />
      <IncomeByBundle transactions={transactions} />
      <IncomeByTxn transactions={transactions} />
      <IncomeByIp transactions={transactions} />
    </Flex>
  );
}
