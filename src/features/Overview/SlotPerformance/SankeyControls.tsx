import styles from "./sankeyControls.module.css";
import { Text } from "@radix-ui/themes";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useAtom, useAtomValue } from "jotai";
import {
  DisplayType,
  sankeyDisplayTypeAtom,
  selectedSlotAtom,
} from "./atoms";
import useSlotQuery from "../../../hooks/useSlotQuery";
import { fixValue } from "../../../utils";
import { useMemo } from "react";

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

    const txnsConfirmed = fixValue(
      query.slotResponse.publish.transactions ?? 0
    );
    const totalTxns = fixValue(
      txnsConfirmed + (query.slotResponse.publish.failed_transactions ?? 0)
    );
    const successRate = totalTxns ? (txnsConfirmed / totalTxns) * 100 : 0;

    const computeUnits = fixValue(
      query.slotResponse?.publish.compute_units ?? 0
    );

    return { successRate, computeUnits };
  }, [query.slotResponse]);

  if (!selectedSlot) return;

  return (
    <div className={styles.stats}>
      <Text>Slot Success Rate</Text>
      <Text
        className={styles.successRate}
        style={{
          color:
            values !== undefined && values.successRate < 50
              ? "#FF5152"
              : undefined,
        }}
      >
        {values?.successRate === 100
          ? "100"
          : (values?.successRate.toFixed(2) ?? "-")}
        %
      </Text>
      <Text>Compute Units</Text>
      <Text>{values?.computeUnits?.toLocaleString() ?? "-"}</Text>
    </div>
  );
}
