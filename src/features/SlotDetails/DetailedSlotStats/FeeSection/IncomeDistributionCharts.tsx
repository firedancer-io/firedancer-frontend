import IncomeByTxn from "./IncomeByTxn";
import IncomeByIp from "./IncomeByIp";
import IncomeByBundle from "./IncomeByBundle";
import IncomeByPctTxns from "./IncomeByPctTxns";
import { useSlotTransactionsContext } from "../../SlotTransactionsContext";

export default function IncomeDistributionCharts() {
  const transactions = useSlotTransactionsContext()?.transactions;

  if (!transactions) return;

  return (
    <>
      <IncomeByPctTxns transactions={transactions} />
      <IncomeByBundle transactions={transactions} />
      <IncomeByTxn transactions={transactions} />
      <IncomeByIp transactions={transactions} />
    </>
  );
}
