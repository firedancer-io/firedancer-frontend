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
    <>
      <IncomeByPctTxns />
      <IncomeByBundle />
      <IncomeByTxn />
      <IncomeByIp />
    </>
  );
}
