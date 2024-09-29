import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "./atoms";
import styles from "./liveSankeyIndicator.module.css";
import { Text } from "@radix-ui/themes";

export default function LiveSankeyIndicator() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const isLive = selectedSlot === undefined;
  if (!isLive) return null;

  return (
    <div className={styles.indicator}>
      <Text className={styles.text}>next leader slot</Text>
    </div>
  );
}
