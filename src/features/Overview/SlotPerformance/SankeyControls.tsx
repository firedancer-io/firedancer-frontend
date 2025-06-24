import styles from "./sankeyControls.module.css";
import { Text, Tooltip } from "@radix-ui/themes";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useAtom, useAtomValue } from "jotai";
import { DisplayType, sankeyDisplayTypeAtom, selectedSlotAtom } from "./atoms";
import { useSlotQueryResponseDetailed } from "../../../hooks/useSlotQuery";
import { fixValue } from "../../../utils";
import { useMemo } from "react";
import { lamportsPerSol } from "../../../consts";
import { formatNumber } from "../../../numUtils";
import RowSeparator from "../../../components/RowSeparator";

export default function SankeyControls() {
  const [value, setValue] = useAtom(sankeyDisplayTypeAtom);

  return (
    <div className={styles.container}>
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        aria-label="Dropped Type"
        value={value}
      >
        <ToggleGroup.Item
          className={styles.toggleGroupItem}
          value={DisplayType.Count}
          aria-label={DisplayType.Count}
          onClick={() => setValue(DisplayType.Count)}
        >
          Count
        </ToggleGroup.Item>
        <ToggleGroup.Item
          className={styles.toggleGroupItem}
          value={DisplayType.Pct}
          aria-label={DisplayType.Pct}
          onClick={() => setValue(DisplayType.Pct)}
        >
          Pct %
        </ToggleGroup.Item>
        <ToggleGroup.Item
          className={styles.toggleGroupItem}
          value={DisplayType.Rate}
          aria-label={DisplayType.Rate}
          onClick={() => setValue(DisplayType.Rate)}
        >
          Rate
        </ToggleGroup.Item>
      </ToggleGroup.Root>
      <SlotStats />
    </div>
  );
}

function SlotStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseDetailed(selectedSlot);

  const values = useMemo(() => {
    if (!query.response?.publish) return;

    const successfulVoteTxns = fixValue(
      query.response.publish.success_vote_transaction_cnt ?? 0,
    );
    const successfulNonvoteTxns = fixValue(
      query.response.publish.success_nonvote_transaction_cnt ?? 0,
    );
    const failedVoteTxns = fixValue(
      query.response.publish.failed_vote_transaction_cnt ?? 0,
    );
    const failedNonvoteTxns = fixValue(
      query.response.publish.failed_nonvote_transaction_cnt ?? 0,
    );

    const transactionFee3Decimals = query.response.publish.transaction_fee
      ? formatNumber(
          Number(query.response.publish.transaction_fee) / lamportsPerSol,
          {
            decimals: 3,
          },
        )
      : "0";

    const transactionFeeFull = query.response.publish.transaction_fee
      ? (
          Number(query.response.publish.transaction_fee) / lamportsPerSol
        ).toFixed(9)
      : "0";

    const priorityFee3Decimals = query.response.publish.priority_fee
      ? formatNumber(
          Number(query.response.publish.priority_fee) / lamportsPerSol,
          {
            decimals: 3,
          },
        )
      : "0";

    const priorityFeeFull = query.response.publish.priority_fee
      ? (Number(query.response.publish.priority_fee) / lamportsPerSol).toFixed(
          9,
        )
      : "0";

    const tips3Decimals = query.response.publish.tips
      ? formatNumber(Number(query.response.publish.tips) / lamportsPerSol, {
          decimals: 3,
        })
      : "0";

    const tips = query.response.publish.tips
      ? (Number(query.response.publish.tips) / lamportsPerSol).toFixed(9)
      : "0";

    const computeUnits = fixValue(query.response.publish.compute_units ?? 0);

    return {
      computeUnits,
      successfulVoteTxns,
      successfulNonvoteTxns,
      failedVoteTxns,
      failedNonvoteTxns,
      transactionFeeFull,
      transactionFee3Decimals,
      priorityFeeFull,
      priorityFee3Decimals,
      tips,
      tips3Decimals,
    };
  }, [query.response]);

  if (!selectedSlot) return;

  return (
    <div className={styles.stats}>
      <Text color="cyan">Priority Fees</Text>
      <Tooltip
        content={
          values?.priorityFeeFull ? `${values?.priorityFeeFull} SOL` : null
        }
      >
        <Text align="right" color="cyan">
          {values?.priorityFee3Decimals ?? "-"}
        </Text>
      </Tooltip>
      <Text color="indigo">Transaction Fees</Text>
      <Tooltip
        content={
          values?.transactionFeeFull
            ? `${values?.transactionFeeFull} SOL`
            : null
        }
      >
        <Text align="right" color="indigo">
          {values?.transactionFee3Decimals ?? "-"}
        </Text>
      </Tooltip>
      <Text color="jade">Tips</Text>
      <Tooltip content={values?.tips ? `${values?.tips} SOL` : null}>
        <Text align="right" color="jade">
          {values?.tips3Decimals ?? "-"}
        </Text>
      </Tooltip>
      <div style={{ gridColumn: "span 2" }}>
        <RowSeparator my="0" />
      </div>
      <Text>Vote Transactions</Text>
      <Text align="right">
        {(values
          ? values.failedVoteTxns + values.successfulVoteTxns
          : undefined
        )?.toLocaleString() ?? "-"}
      </Text>
      <Text>Non-vote Transactions</Text>
      <Text align="right">
        {(values
          ? values.failedNonvoteTxns + values.successfulNonvoteTxns
          : undefined
        )?.toLocaleString() ?? "-"}
      </Text>
      <div style={{ gridColumn: "span 2" }}>
        <RowSeparator my="0" />
      </div>
      <Text color="plum">Compute Units</Text>
      <Text align="right" color="plum">
        {values?.computeUnits?.toLocaleString() ?? "-"}
      </Text>
    </div>
  );
}
