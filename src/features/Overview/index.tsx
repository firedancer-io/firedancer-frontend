import { Flex } from "@radix-ui/themes";
import TransactionsCard from "./TransactionsCard";
import SlotPerformance from "./SlotPerformance";
import styles from "./overview.module.css";
import { useSetAtom } from "jotai";
import { useMount } from "react-use";
import { slotOverrideAtom } from "../../atoms";
import ValidatorsCard from "./ValidatorsCard";
import SlotStatusCard from "./StatusCard";

export default function Overview() {
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  useMount(() => setSlotOverride(undefined));

  return (
    <Flex
      direction="column"
      gap="4"
      className={styles.container}
      align="stretch"
    >
      <div className={styles.cardContainer}>
        <SlotStatusCard />
        <TransactionsCard />
        <ValidatorsCard />
      </div>
      <SlotPerformance />
    </Flex>
  );
}
