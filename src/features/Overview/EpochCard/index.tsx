import { Flex, Progress, Box } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import Card from "../../../components/Card";
import CardStat from "../../../components/CardStat";
import { useAtomValue } from "jotai";
import styles from "./epochCard.module.css";
import { currentSlotAtom, epochAtom, slotDurationAtom } from "../../../atoms";
import { headerColor } from "../../../colors";
import { useMemo } from "react";
import { getDurationText } from "../../../utils";
import { Duration } from "luxon";

export default function EpochCard() {
  return (
    <Card style={{ flexGrow: 1 }}>
      <Flex direction="column" height="100%" gap="2" align="start">
        <CardHeader text="Epoch" />

        <div className={styles.statRow}>
          <CurrentSlotText />
        </div>
        <div className={styles.statRow}>
          <NextEpochTimeText />
        </div>
      </Flex>
    </Card>
  );
}

function CurrentSlotText() {
  const epoch = useAtomValue(epochAtom);

  return (
    <Box>
      <CardStat
        label="Current Epoch"
        value={epoch?.epoch?.toString() ?? ""}
        valueColor={headerColor}
        large
      />
    </Box>
  );
}

function NextEpochTimeText() {
  const slot = useAtomValue(currentSlotAtom);
  const epoch = useAtomValue(epochAtom);
  const slotDuration = useAtomValue(slotDurationAtom);

  const nextEpochText = useMemo(() => {
    if (epoch === undefined || slot === undefined) return "";

    const endDiffMs = (epoch.end_slot - slot) * slotDuration;

    const durationLeft = Duration.fromMillis(endDiffMs).rescale();
    return getDurationText(durationLeft);
  }, [epoch, slot, slotDuration]);

  const progressSinceLastEpoch = useMemo(() => {
    if (epoch === undefined || slot === undefined) return 0;
    const currentSlotDiff = slot - epoch.start_slot;
    const epochDiff = epoch.end_slot - epoch.start_slot;
    const progress = (currentSlotDiff / epochDiff) * 100;
    if (progress < 0 || progress > 100) return 0;
    return progress;
  }, [epoch, slot]);

  return (
    <Flex direction="column">
      <CardStat
        label="Time to Next Epoch"
        value={nextEpochText}
        valueColor={headerColor}
        large
      />
      <Progress
        value={progressSinceLastEpoch}
        size="1"
        className={styles.progress}
      />
    </Flex>
  );
}
