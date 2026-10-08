import { Button, Text } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { isLiveAtom } from "./atoms";
import styles from "./resetLiveButton.module.css";

/**
 * Floating button that returns the chart to live mode. Positioned just below the
 * header track. Hidden while already live.
 */
export default function ResetLiveButton() {
  const [isLive, setIsLive] = useAtom(isLiveAtom);

  if (isLive) return null;

  return (
    <Button className={styles.button} onClick={() => setIsLive(true)}>
      <Text>Return to Live</Text>
    </Button>
  );
}
