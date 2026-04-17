import { Flex, Box } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import Card from "../../../components/Card";
import CardStat from "../../../components/CardStat";
import { useAtomValue } from "jotai";
import styles from "./statusCard.module.css";
import { currentSlotAtom } from "../../../atoms";
import useNextSlot from "../../../hooks/useNextSlot";
import { voteDistanceAtom, voteStateAtom } from "../../../api/atoms";
import {
  failureColor,
  headerColor,
  mySlotsColor,
  nextColor,
  regularTextColor,
  successColor,
  voteDistanceColor,
} from "../../../colors";
import { useMemo } from "react";
import Progress from "../../../components/Progress";

export default function SlotStatusCard() {
  return (
    <Card>
      <Flex direction="column" height="100%" gap="2" align="start">
        <CardHeader text="Status" />
        <div className={styles.statRow}>
          <CurrentSlotText />
          <NextSlotTimeText />
        </div>
        <div className={styles.statRow}>
          <VotingStatusText />
          <UpcomingSlotText />
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

function UpcomingSlotText() {
  const { nextLeaderSlot } = useNextSlot({
    showNowIfCurrent: true,
  });

  return (
    <CardStat
      label="Next leader slot"
      value={nextLeaderSlot?.toString() ?? "∞"}
      valueColor={nextColor}
      valueSize={nextLeaderSlot === undefined ? "large" : "small"}
    />
  );
}

function NextSlotTimeText() {
  const { progressSinceLastLeader, nextSlotText } = useNextSlot({
    showNowIfCurrent: true,
  });

  return (
    <Flex direction="column">
      <CardStat
        label="Time until leader"
        value={nextSlotText}
        valueColor={headerColor}
        valueSize="medium"
      />
      <Progress value={progressSinceLastLeader} />
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
      label="Vote Status"
      value={voteState ?? "Unknown"}
      valueColor={voteColor}
      valueSize="small"
      appendValue={voteDistanceText}
      appendValueColor={voteDistanceColor}
    />
  );
}
