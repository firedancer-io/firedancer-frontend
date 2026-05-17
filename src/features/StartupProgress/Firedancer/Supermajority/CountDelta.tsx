import { Flex, Text } from "@radix-ui/themes";
import styles from "./countDelta.module.css";
import { useCountDelta, DELTA_WINDOW_LABEL } from "./useCountDelta";
interface CountDeltaProps {
  pubkeys: Set<string>;
}
export function CountDelta({ pubkeys }: CountDeltaProps) {
  const { added, removed } = useCountDelta(pubkeys);

  return (
    <Flex className={styles.container} align="center" gap="5px">
      <Text>{DELTA_WINDOW_LABEL}</Text>
      <Text className={styles.added}>+{added}</Text>
      <Text className={styles.removed}>-{removed}</Text>
    </Flex>
  );
}
