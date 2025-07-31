import { Flex, Progress, Box, Text } from "@radix-ui/themes";
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
} from "../../../colors";

export default function SlotStatusCard() {
  return (
    <Card style={{ flexGrow: 1 }}>
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
        value={currentSlot?.toString() ?? ""}
        valueColor={headerColor}
        large
      />
    </Box>
  );
}

function UpcomingSlotText() {
  const { nextLeaderSlot } = useNextSlot();

  return (
    <CardStat
      label="Next leader slot"
      value={nextLeaderSlot?.toString() ?? "∞"}
      valueColor={nextColor}
      valueStyle={
        nextLeaderSlot === undefined
          ? { fontSize: "32px", lineHeight: "16px" }
          : undefined
      }
    />
  );
}

function NextSlotTimeText() {
  const { progressSinceLastLeader, nextSlotText } = useNextSlot();

  return (
    <Flex direction="column">
      <CardStat
        label="Time until leader"
        value={nextSlotText}
        valueColor={headerColor}
        large
      />
      <Progress
        value={progressSinceLastLeader}
        size="1"
        className={styles.progress}
      />
    </Flex>
  );
}

function VotingStatusText() {
  const voteState = useAtomValue(voteStateAtom);

  let voteColor = regularTextColor;
  if (voteState === "voting") {
    voteColor = successColor;
  } else if (voteState === "non-voting") {
    voteColor = mySlotsColor;
  } else if (voteState === "delinquent") {
    voteColor = failureColor;
  }

  return (
    <CardStat
      label="Vote Status"
      value={voteState ?? "Unknown"}
      valueColor={voteColor}
    >
      <VoteDistanceText />
    </CardStat>
  );
}

function VoteDistanceText() {
  const voteDistance = useAtomValue(voteDistanceAtom);
  const voteState = useAtomValue(voteStateAtom);

  if (voteDistance == null) return null;
  if (voteState === "delinquent") return null;

  const value = voteDistance > 150 ? "> 150" : voteDistance;

  return <Text className={styles.voteDistance}>{value} behind</Text>;
}
