import { Flex, Box, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { currentSlotAtom, epochAtom, slotDurationAtom } from "../../atoms";
import { useState } from "react";
import { useInterval } from "react-use";
import { getTimeTillText, slowDateTimeNow } from "../../utils";
import styles from "./epochBounds.module.css";
import { Duration } from "luxon";

const refreshRate = 30 * 1_000;

export default function EpochBounds() {
  const slot = useAtomValue(currentSlotAtom);
  const epoch = useAtomValue(epochAtom);
  const slotDuration = useAtomValue(slotDurationAtom);

  const [labels, setLabels] = useState<
    { start: string; end: string; timeLeft: string } | undefined
  >();

  const computeLabels = () => {
    if (slot === undefined || epoch === undefined) return;

    const startDiffMs = (slot - epoch.start_slot) * slotDuration;
    const startDt = slowDateTimeNow.minus({ milliseconds: startDiffMs });

    const endDiffMs = (epoch.end_slot - slot) * slotDuration;
    const endDt = slowDateTimeNow.plus({ milliseconds: endDiffMs });

    const durationLeft = Duration.fromMillis(endDiffMs).rescale();

    setLabels({
      start: startDt.toFormat("FF"),
      end: endDt.toFormat("FF"),
      timeLeft: getTimeTillText(durationLeft, { showSeconds: false }),
    });
  };

  if (!labels) {
    computeLabels();
  }

  useInterval(computeLabels, refreshRate);

  return (
    <Flex gap="2">
      <Text className={styles.tsLabel}>{labels?.start ?? "-"}</Text>
      <Box flexGrow="1" />
      {labels?.timeLeft && (
        <Text className={styles.durationLabel}>{labels.timeLeft} left</Text>
      )}
      <Text className={styles.tsLabel}>{labels?.end ?? "-"}</Text>
    </Flex>
  );
}
