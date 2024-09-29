import { Flex, Text, Progress } from "@radix-ui/themes";
import styles from "./nextSlotStatus.module.css";
import useNextSlot from "../../../hooks/useNextSlot";

export default function NextSlotStatus() {
  const { progressSinceLastLeader, nextSlotText, nextLeaderSlot } =
    useNextSlot();

  const slotText = nextLeaderSlot !== undefined ? ` (${nextLeaderSlot})` : "";

  return (
    <Flex align="center" gap="2">
      <Text className={styles.label}>Next leader slot{slotText}</Text>
      <Progress value={progressSinceLastLeader} className={styles.progress} />
      <Text className={styles.value}>{nextSlotText}</Text>
    </Flex>
  );
}
