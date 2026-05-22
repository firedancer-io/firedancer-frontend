import { Flex, Text } from "@radix-ui/themes";
import styles from "./supermajorityCounts.module.css";
import {
  SUPERMAJORITY_DELTA_WINDOW_MS,
  supermajorityCountsAtom,
} from "../../../../atoms";
import { useAtomValue } from "jotai";

const SUPERMAJORITY_DELTA_WINDOW_LABEL = `Last ${SUPERMAJORITY_DELTA_WINDOW_MS / 60_000}m`;

interface SupermajorityCountsProps {
  isOffline?: boolean;
}
export function SupermajorityCounts({ isOffline }: SupermajorityCountsProps) {
  const counts = useAtomValue(supermajorityCountsAtom);

  return (
    <Flex className={styles.container} align="center" gap="5px">
      <Text>{SUPERMAJORITY_DELTA_WINDOW_LABEL}</Text>
      <Text className={styles.added}>
        +{isOffline ? counts.offline : counts.online}
      </Text>
      <Text className={styles.removed}>
        -{isOffline ? counts.online : counts.offline}
      </Text>
    </Flex>
  );
}
