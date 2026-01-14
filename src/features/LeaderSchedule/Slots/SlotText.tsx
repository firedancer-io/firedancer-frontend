import { Link } from "@tanstack/react-router";
import { Text } from "@radix-ui/themes";
import styles from "./slotText.module.css";
import clsx from "clsx";

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
  if (!isLeader) {
    return <Text className={clsxName}>{slot}</Text>;
  }

  return (
    <div className={clsxName}>
      <Link to="/slotDetails" search={{ slot }}>
        <Text>{slot}</Text>
      </Link>
    </div>
  );
}
