import DistributionBar from "./DistributionBars";
import { useCallback, useContext, useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { groupBy, sum } from "lodash";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { ChartControlsContext } from "../../ChartControlsContext";
import { SearchMode } from "../../../Overview/SlotPerformance/TransactionBarsCard/consts";

export default function IncomeByIp() {
  const { transactions, updateSearch } = useContext(ChartControlsContext);

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

  const onItemClick = useCallback(
    ({ label }: { label: string; value: number }) => {
      updateSearch({ mode: SearchMode.Ip, text: label }, true);
    },
    [updateSearch],
  );

  return (
    <SlotDetailsSubSection title="Income Distribution by IP Address">
      <DistributionBar data={data} sort onItemClick={onItemClick} />
    </SlotDetailsSubSection>
  );
}
