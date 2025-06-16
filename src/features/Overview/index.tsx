import { Flex } from "@radix-ui/themes";
import TransactionsCard from "./TransactionsCard";
import SlotPerformance from "./SlotPerformance";
import styles from "./overview.module.css";
import { useAtomValue, useSetAtom } from "jotai";
import { epochAtom, slotOverrideAtom } from "../../atoms";
import ValidatorsCard from "./ValidatorsCard";
import SlotStatusCard from "./StatusCard";
import ComputeUnitsCard from "./SlotPerformance/ComputeUnitsCard";
import { useSlotSearchParam } from "./useSearchParams";
import { useEffect } from "react";
import { selectedSlotAtom } from "./SlotPerformance/atoms";
import TransactionBarsCard from "./SlotPerformance/TransactionBarsCard";

export default function Overview() {
  return (
    <Flex
      direction="column"
      gap="4"
      className={styles.container}
      align="stretch"
    >
      <Setup />
      <div className={styles.cardContainer}>
        <SlotStatusCard />
        <TransactionsCard />
        <ValidatorsCard />
      </div>
      <SlotPerformance />
      <ComputeUnitsCard />
      <TransactionBarsCard />
    </Flex>
  );
}

export function Setup() {
  const { selectedSlot } = useSlotSearchParam();
  const setSelectedSlotAtom = useSetAtom(selectedSlotAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const epoch = useAtomValue(epochAtom);

  useEffect(() => {
    // To initially sync atom to search param
    setSelectedSlotAtom(selectedSlot);
  }, [selectedSlot, setSelectedSlotAtom]);

  useEffect(() => {
    // To set the epoch bar / slot selector positions on mount from search param
    setSlotOverride(selectedSlot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, setSlotOverride]);

  return null;
}
