import DistributionBar from "./DistributionBars";
import { useCallback, useContext, useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { groupBy, sum } from "lodash";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { ChartControlsContext } from "../../ChartControlsContext";
import { SearchMode } from "../../../Overview/SlotPerformance/TransactionBarsCard/consts";

export default function IncomeByTxn() {
  const { transactions, updateSearch } = useContext(ChartControlsContext);

  const data = useMemo(() => {
    const signatureValues = transactions.txn_signature.map((signature, i) => {
      return {
        value: Number(getTxnIncome(transactions, i)),
        label: signature,
      };
    });

    return Object.values(groupBy(signatureValues, ({ label }) => label)).map(
      (grouped) => ({
        label: grouped[0].label,
        value: sum(grouped.map(({ value }) => value)),
      }),
    );
  }, [transactions]);

  const onItemClick = useCallback(
    ({ label }: { label: string; value: number }) => {
      updateSearch({ mode: SearchMode.TxnSignature, text: label }, true);
    },
    [updateSearch],
  );

  return (
    <SlotDetailsSubSection title="Income Distribution by Txn">
      <DistributionBar data={data} sort onItemClick={onItemClick} />
    </SlotDetailsSubSection>
  );
}
