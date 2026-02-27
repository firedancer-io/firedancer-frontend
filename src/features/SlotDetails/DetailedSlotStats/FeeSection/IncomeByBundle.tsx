import type { SlotTransactions } from "../../../../api/types";
import DistributionBar from "./DistributionBars";
import { useCallback, useContext, useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { groupBy, sum } from "lodash";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import {
  BUNDLE_CONTROL_KEY,
  ChartControlsContext,
} from "../../ChartControlsContext";

const bundleLabel = "Bundle";

interface IncomeByTxnProps {
  transactions: SlotTransactions;
}
export default function IncomeByBundle({ transactions }: IncomeByTxnProps) {
  const { triggerControl } = useContext(ChartControlsContext);

  const data = useMemo(() => {
    const bundleValues = transactions.txn_from_bundle.map((fromBundle, i) => {
      return {
        value: Number(getTxnIncome(transactions, i)),
        label: fromBundle ? bundleLabel : "Other",
      };
    });

    return Object.values(groupBy(bundleValues, ({ label }) => label))
      .map((grouped) => ({
        label: grouped[0].label,
        value: sum(grouped.map(({ value }) => value)),
      }))
      .sort((a, b) => (a.label === bundleLabel ? -1 : 1));
  }, [transactions]);

  const onItemClick = useCallback(
    ({ label }: { label: string; value: number }) =>
      triggerControl(BUNDLE_CONTROL_KEY, label === bundleLabel ? "Yes" : "No"),
    [triggerControl],
  );

  return (
    <SlotDetailsSubSection title="Income Distribution by Bundle">
      <DistributionBar data={data} showPct onItemClick={onItemClick} />
    </SlotDetailsSubSection>
  );
}
