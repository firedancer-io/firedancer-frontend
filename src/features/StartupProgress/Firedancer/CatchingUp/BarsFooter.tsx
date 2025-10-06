import { Flex, Text } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import styles from "./catchingUp.module.css";
import { catchingUpStartSlotAtom } from "./atoms";

export function BarsFooter() {
  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  if (!startSlot) return;

  return (
    <Flex className={styles.footerRow}>
      <Flex className={styles.leftFooter}>
        <Text className={clsx(styles.footerValue, styles.ellipsis)}>
          <Text className={styles.secondaryColor}>Slot </Text>
          {startSlot}
        </Text>

        <Text className={clsx(styles.footerTitle, styles.ellipsis)}>
          Repair
        </Text>
      </Flex>

      <Text
        className={clsx(
          styles.rightFooter,
          styles.footerTitle,
          styles.ellipsis,
        )}
      >
        Turbine
      </Text>
    </Flex>
  );
}
