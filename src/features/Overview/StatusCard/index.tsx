import CardHeader from "../../../components/CardHeader";
import Card from "../../../components/Card";
import CardStat from "../../../components/CardStat";
import { useAtomValue } from "jotai";
import styles from "./statusCard.module.css";
import {
  alpenglowVoteDistanceAtom,
  currentSlotAtom,
  epochAtom,
  slotDurationAtom,
} from "../../../atoms";
import {
  isAlpenglowAtom,
  voteDistanceAtom,
  voteStateAtom,
} from "../../../api/atoms";
import {
  failureColor,
  headerColor,
  mySlotsColor,
  regularTextColor,
  overviewTextColor,
  successColor,
  voteDistanceColor,
} from "../../../colors";
import { useMemo, type CSSProperties } from "react";
import Progress from "../../../components/Progress";
import { getDurationText } from "../../../utils";
import { Duration } from "../../../timeUtils";

export default function StatusCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div
        className="rt-Flex rt-r-fd-column rt-r-ai-start rt-r-gap-2 rt-r-h"
        style={{ "--height": "100%" } as CSSProperties}
      >
        <CardHeader text="Status" />
        <div className={styles.statRow}>
          <CurrentSlotText />
          <CurrentEpochText />
        </div>
        <div className={styles.statRow}>
          <VotingStatusText />
          <NextEpochTimeText />
        </div>
      </div>
    </Card>
  );
}

function CurrentSlotText() {
  const currentSlot = useAtomValue(currentSlotAtom);

  return (
    <div className="rt-Box">
      <CardStat
        label="Slot"
        value={currentSlot ?? ""}
        valueColor={headerColor}
        valueSize="medium"
        animateInteger
      />
    </div>
  );
}

function CurrentEpochText() {
  const epoch = useAtomValue(epochAtom);

  return (
    <div className="rt-Box">
      <CardStat
        label="Current Epoch"
        value={epoch?.epoch?.toString() ?? ""}
        valueColor={overviewTextColor}
        valueSize="medium"
      />
    </div>
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
    <div className="rt-Flex rt-r-fd-column">
      <CardStat
        label="Time to Next Epoch"
        value={nextEpochText}
        valueColor={overviewTextColor}
        valueSize="small"
      />
      <Progress className={styles.progress} value={progressSinceLastEpoch} />
    </div>
  );
}

function VotingStatusText() {
  const voteState = useAtomValue(voteStateAtom);
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const voteDistance = useAtomValue(
    isAlpenglow ? alpenglowVoteDistanceAtom : voteDistanceAtom,
  );

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
