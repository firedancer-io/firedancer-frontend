import { Link } from "@tanstack/react-router";
import { Flex, Text } from "@radix-ui/themes";
import styles from "./slotText.module.css";
import clsx from "clsx";
import CopyButton from "../../../components/CopyButton";

interface LinkedSlotTextProps {
  slot: number;
  isLeader: boolean;
  className?: string;
}

export default function LinkedSlotText({
  slot,
  isLeader,
  className,
}: LinkedSlotTextProps) {
  const clsxName = clsx(className, styles.slotText);

  // Copy button sibling (can't wrap the <a>), revealed on hover/focus.
  return (
    <Flex align="center" gap="1" className={styles.slotWithCopy}>
      <Text className={clsxName}>
        {isLeader ? (
          <Link to="/slotDetails" search={{ slot }}>
            {slot}
          </Link>
        ) : (
          slot
        )}
      </Text>
      <CopyButton
        value={String(slot)}
        size={12}
        className={styles.copyAffordance}
      />
    </Flex>
  );
}
