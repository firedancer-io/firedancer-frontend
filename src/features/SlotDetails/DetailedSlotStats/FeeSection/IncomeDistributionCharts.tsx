import { Flex } from "@radix-ui/themes";
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
      <IncomeByPctTxns transactions={transactions} />
      <IncomeByBundle transactions={transactions} />
      <IncomeByTxn transactions={transactions} />
      <IncomeByIp transactions={transactions} />
    </Flex>
  );
}
