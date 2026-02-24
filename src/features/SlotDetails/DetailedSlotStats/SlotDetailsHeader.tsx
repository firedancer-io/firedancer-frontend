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
import { TimePopoverContent } from "../../../components/TimePopoverContent";
import PopoverDropdown from "../../../components/PopoverDropdown";
import { useMedia } from "react-use";
import clsx from "clsx";
import CopyButton from "../../../components/CopyButton";
import MonoText from "../../../components/MonoText";

const gap = "5px";

export default function SlotDetailsHeader() {
  const slot = useAtomValue(selectedSlotAtom);
  const { countryCode, countryFlag, cityName } = useSlotInfo(slot ?? 0);
  const epoch = useAtomValue(epochAtom);
  const slotPublish = useSlotQueryPublish(slot).publish;

  const isLgScreen = useMedia("(min-width: 1420px)");
  const isNarrowScreen = useMedia("(min-width: 600px)");

  const columns = useMemo(() => {
    return isLgScreen
      ? "minmax(300px, max-content) minmax(228px, max-content) minmax(200px, max-content) minmax(150px, max-content) minmax(160px, max-content)"
      : isNarrowScreen
        ? "2"
        : "1";
  }, [isLgScreen, isNarrowScreen]);

  if (slot === undefined) return null;

  return (
    <Grid
      className={styles.grid}
      align={isLgScreen ? "center" : "start"}
      justify="between"
      columns={columns}
      gapX="12px"
      gapY={gap}
    >
      <IconNameKey slot={slot} isLgScreen={isLgScreen} />

      <Flex direction="column" gap={gap}>
        <LabelValue
          label="City"
          value={
            cityName && countryCode ? `${cityName}, ${countryCode}` : "Unknown"
          }
          icon={countryFlag}
          vertical={!isLgScreen}
        />
        <LabelValue label="Epoch" value={epoch?.epoch} vertical={!isLgScreen} />
      </Flex>

      {isLgScreen ? (
        <Flex direction="column" gapX={gap} gapY={gap}>
          <SlotTime
            slotCompletedTimeNanos={slotPublish?.completed_time_nanos}
          />
          <BlockHash slot={slot} />
        </Flex>
      ) : (
        <>
          <SlotTime
            slotCompletedTimeNanos={slotPublish?.completed_time_nanos}
            vertical
          />
          <BlockHash slot={slot} vertical />
        </>
      )}

      <Flex direction="column" gap={gap}>
        <LabelValue
          label="Votes"
          value={slotPublish?.success_vote_transaction_cnt?.toLocaleString()}
        />
        <LabelValue
          label="Vote Failures"
          value={slotPublish?.failed_vote_transaction_cnt?.toLocaleString()}
        />
      </Flex>

      <Flex direction="column" gap={gap}>
        <LabelValue
          label="Non-votes"
          value={slotPublish?.success_nonvote_transaction_cnt?.toLocaleString()}
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
  valuePopover?: React.ReactNode;
  icon?: string;
  vertical?: boolean;
  allowCopy?: boolean;
}

function LabelValue({
  label,
  value,
  valuePopover,
  icon,
  vertical = false,
  allowCopy = false,
}: LabelValueProps) {
  return (
    <Flex gapX="2" direction={vertical ? "column" : "row"}>
      <MonoText className={styles.label}>{label}</MonoText>

      <PopoverDropdown content={valuePopover} align="start">
        <CopyButton
          className={styles.copyButton}
          size={14}
          value={allowCopy ? value?.toString() : undefined}
          hideIconUntilHover
        >
          <MonoText
            truncate
            className={clsx(styles.value, valuePopover && styles.clickable)}
          >
            {value}
            {icon && ` ${icon}`}
          </MonoText>
        </CopyButton>
      </PopoverDropdown>
    </Flex>
  );
}

interface IconNameKeyProps {
  slot: number;
  isLgScreen: boolean;
}

function IconNameKey({ slot, isLgScreen }: IconNameKeyProps) {
  const { peer, isLeader, name, pubkey } = useSlotInfo(slot ?? 0);

  if (isLgScreen) {
    return (
      <Flex gapX="10px" align="center">
        <PeerIcon url={peer?.info?.icon_url} size={42} isYou={isLeader} />

        <Flex direction="column" gapY="1px" minWidth="0">
          <Text className={clsx(styles.name, styles.lg)}>{name}</Text>
          <Pubkey slot={slot} pubkey={pubkey} />
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex direction="column">
      <Flex gapX={gap} align="center">
        <PeerIcon url={peer?.info?.icon_url} size={15} isYou={isLeader} />
        <Text className={styles.name}>{name}</Text>
      </Flex>

      <Pubkey slot={slot} pubkey={pubkey} />
    </Flex>
  );
}

interface PubkeyProps {
  slot: number;
  pubkey: string | undefined;
}

function Pubkey({ slot, pubkey }: PubkeyProps) {
  return (
    <Flex gapX={gap} align="center">
      <CopyButton
        className={styles.copyButton}
        size={14}
        value={pubkey}
        hideIconUntilHover
      >
        <MonoText truncate className={styles.value}>
          {pubkey}
        </MonoText>
      </CopyButton>

      <SlotClient slot={slot} size="large" />
    </Flex>
  );
}

interface SlotTimeProps {
  slotCompletedTimeNanos: bigint | null | undefined;
  vertical?: boolean;
}

function SlotTime({ vertical = false, slotCompletedTimeNanos }: SlotTimeProps) {
  const formattedSlotTime = useMemo(() => {
    if (slotCompletedTimeNanos == null) return;
    return formatTimeNanos(slotCompletedTimeNanos);
  }, [slotCompletedTimeNanos]);

  return (
    <LabelValue
      label="Slot Time"
      value={formattedSlotTime?.inMillis}
      valuePopover={
        slotCompletedTimeNanos ? (
          <TimePopoverContent
            nanoTs={slotCompletedTimeNanos}
            units="nanoseconds"
          />
        ) : undefined
      }
      vertical={vertical}
    />
  );
}

interface BlockHashProps {
  slot: number;
  vertical?: boolean;
}

function BlockHash({ slot, vertical = false }: BlockHashProps) {
  const client = useAtomValue(clientAtom);
  const schedulerStats =
    useSlotQueryResponseDetailed(slot).response?.scheduler_stats;

  return (
    <LabelValue
      label="Block Hash"
      value={
        client === ClientEnum.Frankendancer
          ? "Not available for Frankendancer"
          : schedulerStats?.block_hash
      }
      vertical={vertical}
      allowCopy={
        client !== ClientEnum.Frankendancer &&
        schedulerStats?.block_hash != null
      }
    />
  );
}
