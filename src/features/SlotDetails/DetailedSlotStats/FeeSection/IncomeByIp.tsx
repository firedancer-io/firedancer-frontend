import type { SlotTransactions } from "../../../../api/types";
import DistributionBar from "./DistributionBars";
import { useCallback, useContext, useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { groupBy, sum } from "lodash";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import {
  BUNDLE_CONTROL_KEY,
  ChartControlsContext,
  ERROR_STATE_CONTROL_KEY,
  LANDED_CONTROL_KEY,
  SEARCH_KEY,
  SearchMode,
  VOTE_CONTROL_KEY,
} from "../../ChartControlsContext";

interface IncomeByTxnProps {
  transactions: SlotTransactions;
}

export default function IncomeByIp({ transactions }: IncomeByTxnProps) {
  const { triggerControl, resetControl } = useContext(ChartControlsContext);

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
      resetControl(ERROR_STATE_CONTROL_KEY);
      resetControl(LANDED_CONTROL_KEY);
      resetControl(VOTE_CONTROL_KEY);
      resetControl(BUNDLE_CONTROL_KEY);
      triggerControl(SEARCH_KEY, { mode: SearchMode.Ip, text: label });
    },
    [resetControl, triggerControl],
  );

  return (
    <SlotDetailsSubSection title="Income Distribution by IP Address">
      <DistributionBar data={data} sort onItemClick={onItemClick} />
    </SlotDetailsSubSection>
  );
}
