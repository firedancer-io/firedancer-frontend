import styles from "./sankeyControls.module.css";
import { Text } from "@radix-ui/themes";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useAtom, useAtomValue } from "jotai";
import { DisplayType, sankeyDisplayTypeAtom, selectedSlotAtom } from "./atoms";
import { useSlotQueryResponse } from "../../../hooks/useSlotQuery";
import { fixValue } from "../../../utils";
import { useMemo } from "react";
import { lamportsPerSol } from "../../../consts";

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
  const query = useSlotQueryResponse(selectedSlot);

  const values = useMemo(() => {
    if (!query.response?.publish) return;

    const voteTxns = fixValue(query.response.publish.vote_transactions ?? 0);
    const totalTxns = fixValue(query.response.publish.transactions ?? 0);
    const nonVoteTxns = totalTxns - voteTxns;

    const transactionFeeFull =
      query.response.publish.transaction_fee != null
        ? (
            Number(query.response.publish.transaction_fee) / lamportsPerSol
          ).toFixed(9)
        : "0";

    const priorityFeeFull =
      query.response.publish.priority_fee != null
        ? (
            Number(query.response.publish.priority_fee) / lamportsPerSol
          ).toFixed(9)
        : "0";

    const tips =
      query.response.publish.tips != null
        ? (Number(query.response.publish.tips) / lamportsPerSol).toFixed(9)
        : "0";

    const computeUnits = fixValue(query.response.publish.compute_units ?? 0);

    return {
      computeUnits,
      voteTxns,
      nonVoteTxns,
      transactionFeeFull,
      priorityFeeFull,
      tips,
    };
  }, [query.response]);

  if (!selectedSlot) return;

  return (
    <div className={styles.stats}>
      <Text>Priority Fees</Text>
      <Text style={{ textAlign: "right" }}>
        {values?.priorityFeeFull ?? "-"}
      </Text>
      <Text>Transaction Fees</Text>
      <Text style={{ textAlign: "right" }}>
        {values?.transactionFeeFull ?? "-"}
      </Text>
      <Text>Tips</Text>
      <Text style={{ textAlign: "right" }}>{values?.tips ?? "-"}</Text>
      <Text>Vote Transactions</Text>
      <Text style={{ textAlign: "right" }}>
        {values?.voteTxns?.toLocaleString() ?? "-"}
      </Text>
      <Text>Non-vote Transactions</Text>
      <Text style={{ textAlign: "right" }}>
        {values?.nonVoteTxns?.toLocaleString() ?? "-"}
      </Text>
      <Text>Compute Units</Text>
      <Text style={{ textAlign: "right" }}>
        {values?.computeUnits?.toLocaleString() ?? "-"}
      </Text>
    </div>
  );
}
