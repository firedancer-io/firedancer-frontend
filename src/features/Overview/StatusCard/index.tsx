import { Flex, Box } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import Card from "../../../components/Card";
import CardStat from "../../../components/CardStat";
import { useAtomValue } from "jotai";
import styles from "./statusCard.module.css";
import { currentSlotAtom, epochAtom, slotDurationAtom } from "../../../atoms";
import { voteDistanceAtom, voteStateAtom } from "../../../api/atoms";
import {
  failureColor,
  headerColor,
  mySlotsColor,
  regularTextColor,
  overviewTextColor,
  successColor,
  voteDistanceColor,
} from "../../../colors";
import { useMemo } from "react";
import Progress from "../../../components/Progress";
import { getDurationText } from "../../../utils";
import { Duration } from "luxon";

export default function StatusCard() {
  return (
    <Card>
      <Flex direction="column" height="100%" gap="2" align="start">
        <CardHeader text="Status" />
        <div className={styles.statRow}>
          <CurrentSlotText />
          <CurrentEpochText />
        </div>
        <div className={styles.statRow}>
          <VotingStatusText />
          <NextEpochTimeText />
        </div>
      </Flex>
    </Card>
  );
}

function CurrentSlotText() {
  const currentSlot = useAtomValue(currentSlotAtom);

  return (
    <Box>
      <CardStat
        label="Slot"
        value={currentSlot ?? ""}
        valueColor={headerColor}
        valueSize="medium"
        animateInteger
      />
    </Box>
  );
}

function CurrentEpochText() {
  const epoch = useAtomValue(epochAtom);

  return (
    <Box>
      <CardStat
        label="Current Epoch"
        value={epoch?.epoch?.toString() ?? ""}
        valueColor={overviewTextColor}
        valueSize="medium"
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
        valueColor={overviewTextColor}
        valueSize="small"
      />
      <Progress className={styles.progress} value={progressSinceLastEpoch} />
    </Flex>
  );
}

function VotingStatusText() {
  const voteState = useAtomValue(voteStateAtom);
  const voteDistance = useAtomValue(voteDistanceAtom);

  const voteColor = useMemo(() => {
    if (voteState === "voting") {
      return successColor;
    } else if (voteState === "non-voting") {
      return mySlotsColor;
    } else if (voteState === "delinquent") {
      return failureColor;
    }
    return regularTextColor;
  }, [voteState]);

  const voteDistanceText = useMemo(() => {
    if (voteDistance == null) return undefined;
    if (voteState === "delinquent") return undefined;

    const value = voteDistance > 150 ? "> 150" : voteDistance;
    return `${value} behind`;
  }, [voteDistance, voteState]);

  return (
    <CardStat
      label="Voting"
      value={voteState === "voting" ? "Healthy" : (voteState ?? "Unknown")}
      valueColor={voteColor}
      valueSize="small"
      appendValue={voteDistanceText}
      appendValueColor={voteDistanceColor}
    />
  );
}
