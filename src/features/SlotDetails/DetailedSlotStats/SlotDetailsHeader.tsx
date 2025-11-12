import { Box, Flex, Text } from "@radix-ui/themes";
import PeerIcon from "../../../components/PeerIcon";
import SlotClient from "../../../components/SlotClient";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import { useAtomValue } from "jotai";
import {
  useSlotQueryPublish,
  useSlotQueryResponseDetailed,
} from "../../../hooks/useSlotQuery";
import { epochAtom } from "../../../atoms";
import { useMemo } from "react";
import { DateTime } from "luxon";
import {
  slotDetailsStatsPrimary,
  slotDetailsStatsSecondary,
} from "../../../colors";

export default function SlotDetailsHeader() {
  const slot = useAtomValue(selectedSlotAtom);
  const { peer, isLeader, name } = useSlotInfo(slot ?? 0);
  const epoch = useAtomValue(epochAtom);
  const slotPublish = useSlotQueryPublish(slot).publish;
  const schedulerStats =
    useSlotQueryResponseDetailed(slot).response?.scheduler_stats;

  const slotTime = useMemo(() => {
    if (!slotPublish?.completed_time_nanos) return;
    const seconds = Number(slotPublish.completed_time_nanos / 1_000_000_000n);
    return DateTime.fromSeconds(seconds).toLocaleString({
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  }, [slotPublish]);

  if (slot === undefined) return;

  return (
    // TODO: Fix to a better layout
    <Flex gapX="clamp(8px, 1vw, 80px)" gapY="1" wrap="wrap" align="center">
      <Flex gap="1" align="center" minWidth="0">
        <PeerIcon url={peer?.info?.icon_url} size={16} isYou={isLeader} />
        <Text
          weight="bold"
          truncate
          style={{
            fontWeight: 600,
            color: "#CCC",
          }}
        >
          {name}
        </Text>
        <SlotClient slot={slot} size="large" />
      </Flex>
      <HorizontalLabelValue label="Country" value="USA" />
      <HorizontalLabelValue label="Slot Time" value={slotTime} />
      <HorizontalLabelValue
        label="Block Hash"
        value={schedulerStats?.block_hash}
      />
      <HorizontalLabelValue
        label="Votes"
        value={slotPublish?.success_vote_transaction_cnt?.toLocaleString()}
      />
      <HorizontalLabelValue
        label="Vote Failures"
        value={slotPublish?.failed_vote_transaction_cnt?.toLocaleString()}
      />
      <HorizontalLabelValue
        label="Non-votes"
        value={slotPublish?.failed_nonvote_transaction_cnt?.toLocaleString()}
      />
      <HorizontalLabelValue
        label="Non-vote Failures"
        value={slotPublish?.failed_nonvote_transaction_cnt?.toLocaleString()}
      />
      <HorizontalLabelValue label="Epoch" value={epoch?.epoch} />
    </Flex>
  );
}

interface HorizontalLabelValueProps {
  label: string;
  value?: string | number;
}

function HorizontalLabelValue({ label, value }: HorizontalLabelValueProps) {
  return (
    <Box flexGrow="1">
      <Text size="1" style={{ color: slotDetailsStatsSecondary }}>
        {label}&nbsp;
      </Text>
      <Text size="1" style={{ color: slotDetailsStatsPrimary }}>
        &nbsp;{value}
      </Text>
    </Box>
  );
}
