import { Button, Text } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtomValue, useSetAtom } from "jotai";
import { isLiveAtom, returnToLiveAtom } from "./atoms";
import chartStyles from "./chart.module.css";
import styles from "./resetLiveButton.module.css";

/**
 * Floating button that returns the chart to live mode. Positioned just below the
 * header track. Hidden while already live.
 */
export default function ResetLiveButton() {
  const isLive = useAtomValue(isLiveAtom);
  const returnToLive = useSetAtom(returnToLiveAtom);

  if (isLive) return null;

  return (
    <Button
      className={clsx(chartStyles.noChartExplore, styles.button)}
      onClick={() => returnToLive()}
    >
      <Text>Return to Live</Text>
    </Button>
  );
}
