import { Flex, Text } from "@radix-ui/themes";
import type { SlotTransactions } from "../../../../api/types";
import DistributionBar from "./DistributionBars";
import { useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { groupBy, sum } from "lodash";

interface IncomeByTxnProps {
  transactions: SlotTransactions;
}
export default function IncomeByBundle({ transactions }: IncomeByTxnProps) {
  const data = useMemo(() => {
    const bundleValues = transactions.txn_from_bundle.map((fromBundle, i) => {
      return {
        value: Number(getTxnIncome(transactions, i)),
        label: fromBundle ? "Bundle" : "Other",
      };
    });

    return Object.values(groupBy(bundleValues, ({ label }) => label))
      .map((grouped) => ({
        label: grouped[0].label,
        value: sum(grouped.map(({ value }) => value)),
      }))
      .sort((a, b) => (a.label === "Bundle" ? -1 : 1));
  }, [transactions]);

  return (
    <Flex direction="column">
      <Text style={{ color: "var(--gray-12)" }}>
        Income Distribution by Bundle
      </Text>
      <DistributionBar data={data} showPct />
    </Flex>
  );
}
