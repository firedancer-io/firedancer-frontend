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
import { useSetAtom } from "jotai";
import { txnBarsUplotActionAtom } from "../../../Overview/SlotPerformance/TransactionBarsCard/uplotAtoms";
import { banksXScaleKey } from "../../../Overview/SlotPerformance/ComputeUnitsCard/consts";

const bundleLabel = "Bundle";

interface IncomeByTxnProps {
  transactions: SlotTransactions;
}
export default function IncomeByBundle({ transactions }: IncomeByTxnProps) {
  const { triggerControl, resetAllControls } = useContext(ChartControlsContext);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);

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
    ({ label }: { label: string; value: number }) => {
      resetAllControls([BUNDLE_CONTROL_KEY]);
      triggerControl(BUNDLE_CONTROL_KEY, label === bundleLabel ? "Yes" : "No");
      // Zoom out so all transactions are visible
      uplotAction((u) => {
        u.setScale(banksXScaleKey, {
          min: u.data[0][0],
          max: u.data[0][u.data[0].length - 1],
        });
      });
    },
    [resetAllControls, triggerControl, uplotAction],
  );

  return (
    <SlotDetailsSubSection title="Income Distribution by Bundle">
      <DistributionBar data={data} showPct onItemClick={onItemClick} />
    </SlotDetailsSubSection>
  );
}
