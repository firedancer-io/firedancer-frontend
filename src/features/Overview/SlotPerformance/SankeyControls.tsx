import styles from "./sankeyControls.module.css";
import { Text } from "@radix-ui/themes";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useAtom, useAtomValue } from "jotai";
import { DisplayType, sankeyDisplayTypeAtom, selectedSlotAtom } from "./atoms";
import useSlotQuery from "../../../hooks/useSlotQuery";
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
      </ToggleGroup.Root>
      <SlotStats />
    </div>
  );
}

function SlotStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQuery(selectedSlot);

  const values = useMemo(() => {
    if (!query.slotResponse) return;

    const voteTxns = fixValue(
      query.slotResponse.publish.vote_transactions ?? 0
    );
    const totalTxns = fixValue(query.slotResponse.publish.transactions ?? 0);
    const nonVoteTxns = totalTxns - voteTxns;

    const transactionFeeFull =
      query.slotResponse.publish.transaction_fee != null
        ? (
            query.slotResponse.publish.transaction_fee / lamportsPerSol
          ).toString()
        : "0";

    const priorityFeeFull =
      query.slotResponse.publish.priority_fee != null
        ? (query.slotResponse.publish.priority_fee / lamportsPerSol).toString()
        : "0";

    const computeUnits = fixValue(
      query.slotResponse?.publish.compute_units ?? 0
    );

    return {
      computeUnits,
      voteTxns,
      nonVoteTxns,
      transactionFeeFull,
      priorityFeeFull,
    };
  }, [query.slotResponse]);

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
