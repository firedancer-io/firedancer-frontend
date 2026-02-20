import DistributionBar from "./DistributionBars";
import { useCallback, useContext, useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { groupBy, sum } from "lodash";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { ChartControlsContext } from "../../ChartControlsContext";

export default function IncomeByBundle() {
  const { transactions, updateBundleFilter } = useContext(ChartControlsContext);

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

  const onItemClick = useCallback(
    ({ label }: { label: string; value: number }) =>
      updateBundleFilter(label === "Bundle" ? "Yes" : "No"),
    [updateBundleFilter],
  );

  return (
    <SlotDetailsSubSection title="Income Distribution by Bundle">
      <DistributionBar data={data} showPct onItemClick={onItemClick} />
    </SlotDetailsSubSection>
  );
}
