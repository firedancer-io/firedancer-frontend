import { Flex, Text } from "@radix-ui/themes";
import styles from "./nextSlotStatus.module.css";
import useNextSlot from "../../../hooks/useNextSlot";
import Progress from "../../../components/Progress";

export default function NextSlotStatus() {
  const { progressSinceLastLeader, nextSlotText, nextLeaderSlot } = useNextSlot(
    {
      showNowIfCurrent: true,
    },
  );

  const slotText = nextLeaderSlot !== undefined ? ` (${nextLeaderSlot})` : "";

  return (
    <Flex align="center" gap="2">
      <Text className={styles.label}>Next leader slot{slotText}</Text>
      <Progress width="60px" height="8px" value={progressSinceLastLeader} />
      <Text className={styles.value}>{nextSlotText}</Text>
    </Flex>
  );
}
