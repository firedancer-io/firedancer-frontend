import { Flex, Grid, Text } from "@radix-ui/themes";
import PeerIcon from "../../../components/PeerIcon";
import SlotClient from "../../../components/SlotClient";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import { useAtomValue } from "jotai";
import {
  useSlotQueryPublish,
  useSlotQueryResponseDetailed,
} from "../../../hooks/useSlotQuery";
import { clientAtom, epochAtom } from "../../../atoms";
import { useMemo } from "react";

import styles from "./detailedSlotStats.module.css";
import { formatTimeNanos } from "../../../utils";
import { ClientEnum } from "../../../api/entities";
import ConditionalTooltip from "../../../components/ConditionalTooltip";
import { useMedia } from "react-use";
import clsx from "clsx";

const gapX = 5;
const gapXPx = `${gapX}px`;
const gapYPx = "10px";

export default function SlotDetailsHeader() {
  const client = useAtomValue(clientAtom);
  const slot = useAtomValue(selectedSlotAtom);
  const { peer, isLeader, name, pubkey, countryCode, countryFlag, cityName } =
    useSlotInfo(slot ?? 0);
  const epoch = useAtomValue(epochAtom);
  const slotPublish = useSlotQueryPublish(slot).publish;
  const schedulerStats =
    useSlotQueryResponseDetailed(slot).response?.scheduler_stats;

  const slotTime = useMemo(() => {
    if (!slotPublish?.completed_time_nanos) return;
    return formatTimeNanos(slotPublish.completed_time_nanos);
  }, [slotPublish]);

  const isLgScreen = useMedia("(min-width: 1420px)");
  const isNarrowScreen = useMedia("(min-width: 600px)") && !isLgScreen;

  const { iconSize, columns } = useMemo(() => {
    if (isLgScreen) {
      return {
        iconSize: 30,
        columns:
          "minmax(300px, max-content) minmax(228px, max-content) minmax(200px, max-content) minmax(150px, max-content) minmax(160px, max-content)",
      };
    }
    if (isNarrowScreen) {
      return {
        iconSize: 15,
        columns: "2",
      };
    }
    return {
      iconSize: 15,
      columns: "1",
    };
  }, [isLgScreen, isNarrowScreen]);

  if (slot === undefined) return;

  const slotTimeBlockHash = (
    <>
      <LabelValue
        label="Slot Time"
        value={slotTime?.inMillis}
        valueTooltip={slotTime?.inNanos}
        isVertical={!isLgScreen}
      />
      <LabelValue
        label="Block Hash"
        value={
          client === ClientEnum.Frankendancer
            ? "Not available for Frankendancer"
            : schedulerStats?.block_hash
        }
        isVertical={!isLgScreen}
      />
    </>
  );

  return (
    <Grid
      className={styles.grid}
      align="center"
      justify="between"
      columns={columns}
      gapX="12px"
      gapY={gapYPx}
    >
      <Flex
        direction="column"
        style={{ alignSelf: isLgScreen ? "center" : "flex-start" }}
      >
        <Flex gapX={gapXPx} align="center">
          <PeerIcon
            url={peer?.info?.icon_url}
            size={iconSize}
            isYou={isLeader}
          />
          <Text
            className={clsx(styles.name, {
              [styles.lg]: isLgScreen,
            })}
          >
            {name}
          </Text>
        </Flex>
        <Flex
          ml={isLgScreen ? `${iconSize + gapX}px` : "0"}
          gapX={gapXPx}
          align="center"
        >
          <Text truncate className={styles.pubkey}>
            {pubkey}
          </Text>
          <SlotClient slot={slot} size="medium" />
        </Flex>
      </Flex>

      <Flex direction="column" gapX={gapXPx} gapY={gapYPx}>
        <LabelValue
          label="City"
          value={
            cityName && countryCode ? `${cityName}, ${countryCode}` : "Unknown"
          }
          icon={countryFlag}
          isVertical={!isLgScreen}
        />
        <LabelValue
          label="Epoch"
          value={epoch?.epoch}
          isVertical={!isLgScreen}
        />
      </Flex>

      {isLgScreen ? (
        <Flex direction="column" gapX={gapXPx} gapY={gapYPx}>
          {slotTimeBlockHash}
        </Flex>
      ) : (
        slotTimeBlockHash
      )}

      <Flex direction="column" gapX={gapXPx} gapY={gapYPx}>
        <LabelValue
          label="Votes"
          value={slotPublish?.success_vote_transaction_cnt?.toLocaleString()}
        />
        <LabelValue
          label="Vote Failures"
          value={slotPublish?.failed_vote_transaction_cnt?.toLocaleString()}
        />
      </Flex>

      <Flex direction="column" gapX={gapXPx} gapY={gapYPx}>
        <LabelValue
          label="Non-votes"
          value={slotPublish?.failed_nonvote_transaction_cnt?.toLocaleString()}
        />
        <LabelValue
          label="Non-vote Failures"
          value={slotPublish?.failed_nonvote_transaction_cnt?.toLocaleString()}
        />
      </Flex>
    </Grid>
  );
}

interface LabelValueProps {
  label: string;
  value?: string | number;
  valueTooltip?: string | number;
  icon?: string;
  isVertical?: boolean;
}

function LabelValue({
  label,
  value,
  valueTooltip,
  icon,
  isVertical = false,
}: LabelValueProps) {
  return (
    <Flex gapX="2" direction={isVertical ? "column" : "row"}>
      <Text className={styles.label}>{label}</Text>
      <ConditionalTooltip content={valueTooltip}>
        <Text truncate className={styles.value}>
          {value}
          {icon && ` ${icon}`}
        </Text>
      </ConditionalTooltip>
    </Flex>
  );
}
