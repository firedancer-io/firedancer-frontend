import type { SlotTransactions } from "../../../../api/types";
import DistributionBar from "./DistributionBars";
import { useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { groupBy, sum } from "lodash";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";

interface IncomeByTxnProps {
  transactions: SlotTransactions;
}
export default function IncomeByIp({ transactions }: IncomeByTxnProps) {
  const data = useMemo(() => {
    const ipValues = transactions.txn_source_ipv4.map((ip, i) => {
      return {
        value: Number(getTxnIncome(transactions, i)),
        label: ip,
      };
    });
    return Object.values(groupBy(ipValues, ({ label }) => label)).map(
      (grouped) => ({
        label: grouped[0].label,
        value: sum(grouped.map(({ value }) => value)),
      }),
    );
  }, [transactions]);

  return (
    <SlotDetailsSubSection title="Income Distribution by IP Address">
      <DistributionBar data={data} sort />
    </SlotDetailsSubSection>
  );
}
