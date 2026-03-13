import { Flex, Text } from "@radix-ui/themes";
import HowToVoteIcon from "@material-design-icons/svg/filled/how_to_vote.svg?react";
import LayersIcon from "@material-design-icons/svg/filled/layers.svg?react";
import CycloneIcon from "@material-design-icons/svg/filled/cyclone.svg?react";
import ReplayIcon from "@material-design-icons/svg/filled/replay_circle_filled.svg?react";
import { type FC, type SVGProps } from "react";
import styles from "./healthPane.module.css";
import clsx from "clsx";
import { useMedia } from "react-use";
import { useAtomValue } from "jotai";
import {
  blockEngineAtom,
  completedSlotAtom,
  liveNetworkMetricsAtom,
  turbineSlotAtom,
  voteSlotAtom,
  voteStateAtom,
} from "../../api/atoms";
import PopoverDropdown from "../../components/PopoverDropdown";
import { useEma, useEmaValue } from "../../hooks/useEma";
import { clientAtom } from "../../atoms";
import { ClientEnum } from "../../api/entities";
import { networkProtocols } from "../Overview/LiveNetworkMetrics/consts";

export default function HealthPane() {
  const isStacked = useMedia("(max-width: 450px)");
  const isNarrow = useMedia("(max-width: 390px)");

  return (
    <Flex
      aria-label="Health Pane"
      className={clsx(styles.healthPane, {
        [styles.vertical]: isStacked,
        [styles.narrow]: isNarrow,
      })}
      height="28px"
      justify="between"
      align="center"
      gapX="3px"
      gapY="2px"
    >
      <VoteHealth isStacked={isStacked} />
      <BundleHealth isStacked={isStacked} />
      <TurbineHealth isStacked={isStacked} />
      <ReplayHealth isStacked={isStacked} />
    </Flex>
  );
}

interface HealthButtonProps {
  title: string;
  description: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
  isAlerting: boolean;
  isStacked: boolean;
}
function HealthButton({
  title,
  description,
  Icon,
  isAlerting,
  isStacked,
}: HealthButtonProps) {
  return (
    <PopoverDropdown
      className={styles.popover}
      content={
        <Flex direction="column" gap="4px">
          <Flex gap="5px">
            <Text className={styles.title}>{title}</Text>
            <Text
              className={clsx(styles.status, { [styles.alerting]: isAlerting })}
            >
              {isAlerting ? "Unhealthy" : "Healthy"}
            </Text>
          </Flex>
          <div className={styles.content}>
            <Text>{description}</Text>
          </div>
        </Flex>
      }
    >
      <button
        aria-label={`${title}: ${isAlerting ? "Unhealthy" : "Healthy"}`}
        className={clsx(styles.healthButton, {
          [styles.alerting]: isAlerting,
          [styles.stacked]: isStacked,
        })}
      >
        {!isStacked && <Icon width="75%" />}
      </button>
    </PopoverDropdown>
  );
}

interface StackableProps {
  isStacked: boolean;
}

function VoteHealth({ isStacked }: StackableProps) {
  const title = "Vote Health";

  const voteState = useAtomValue(voteStateAtom);
  const voteSlot = useAtomValue(voteSlotAtom);
  const turbineSlot = useAtomValue(turbineSlotAtom);

  const isAlerting = voteState === "delinquent";
  const description = isAlerting
    ? voteSlot == null || turbineSlot == null
      ? "Missing vote slot or turbine slot data."
      : `We haven't landed a vote since slot ${voteSlot} (${voteSlot - turbineSlot}).`
    : "Our consensus votes are being received by other nodes normally.";

  return (
    <HealthButton
      title={title}
      Icon={HowToVoteIcon}
      isStacked={isStacked}
      isAlerting={isAlerting}
      description={description}
    />
  );
}

function BundleHealth({ isStacked }: StackableProps) {
  const blockEngine = useAtomValue(blockEngineAtom);

  if (!blockEngine) return null;

  const title = "Bundle Health";
  const isConnected = blockEngine.status === "connected";
  const description = `Currently ${blockEngine.status} ${blockEngine.status === "disconnected" ? "from" : "to"} ${blockEngine.name} - ${blockEngine.url} (${blockEngine.ip})`;

  return (
    <HealthButton
      title={title}
      Icon={LayersIcon}
      isStacked={isStacked}
      isAlerting={!isConnected}
      description={description}
    />
  );
}

function TurbineHealth({ isStacked }: StackableProps) {
  const client = useAtomValue(clientAtom);
  if (client === ClientEnum.Frankendancer) {
    return (
      <BaseTurbineHealth isStacked={isStacked} isNetworkStatsAlerting={false} />
    );
  }

  return <TurbineHealthWithNetworkStats isStacked={isStacked} />;
}

const emaOptions = {
  halfLifeMs: 1_000,
};
const turbineProtocolIdx = networkProtocols.indexOf("turbine");
const repairProtocolIdx = networkProtocols.indexOf("repair");

function TurbineHealthWithNetworkStats({ isStacked }: StackableProps) {
  const liveNetworkMetrics = useAtomValue(liveNetworkMetricsAtom);

  const turbineValue = liveNetworkMetrics?.ingress[turbineProtocolIdx];
  const turbineRate = useEmaValue(turbineValue, emaOptions);

  const repairValue = liveNetworkMetrics?.ingress[repairProtocolIdx];
  const repairRate = useEmaValue(repairValue, emaOptions);

  const isAlerting = turbineRate < repairRate;

  return (
    <BaseTurbineHealth
      isStacked={isStacked}
      isNetworkStatsAlerting={isAlerting}
    />
  );
}

/**
 * 2.5 blocks/s
 * Ema threshold = 2.5 × 0.5^(5000 / half life).
 * Ema after 5 seconds of no blocks at 1_000ms half life = 0.09
 * choose threshold between 0.09 and 2.5
 */
const turbineEmaOptions = {
  forceUpdateIntervalMs: 1_000,
  initMinSamples: 2,
  halfLifeMs: 1_000,
};
const turbineEmaThreshold = 0.5;

interface BaseTurbineHealthProps extends StackableProps {
  isNetworkStatsAlerting: boolean;
}

function BaseTurbineHealth({
  isStacked,
  isNetworkStatsAlerting,
}: BaseTurbineHealthProps) {
  const title = "Turbine Health";

  const turbineSlot = useAtomValue(turbineSlotAtom);
  const { ema: turbineRate } = useEma(turbineSlot, turbineEmaOptions);

  const isAlerting =
    isNetworkStatsAlerting ||
    turbineSlot == null ||
    (turbineRate != null && turbineRate < turbineEmaThreshold);

  const description = isAlerting
    ? turbineSlot == null
      ? "Missing turbine slot data."
      : "We are receiving little to no block data from other nodes over Turbine."
    : "Block data is arriving normally over Turbine.";

  return (
    <HealthButton
      title={title}
      Icon={CycloneIcon}
      isStacked={isStacked}
      isAlerting={isAlerting}
      description={description}
    />
  );
}

const REPLAY_ALERT_THRESHOLD_SLOTS = 12;
function ReplayHealth({ isStacked }: StackableProps) {
  const title = "Replay Health";

  const turbineSlot = useAtomValue(turbineSlotAtom);
  const processedSlot = useAtomValue(completedSlotAtom);

  const isAlerting =
    turbineSlot == null ||
    processedSlot == null ||
    turbineSlot - processedSlot > REPLAY_ALERT_THRESHOLD_SLOTS;

  const description = isAlerting
    ? turbineSlot == null || processedSlot == null
      ? "Missing turbine slot or processed slot data."
      : `Replay is ${turbineSlot - processedSlot} behind the rest of the cluster.`
    : "Replay is keeping up with the cluster.";

  return (
    <HealthButton
      title={title}
      Icon={ReplayIcon}
      isStacked={isStacked}
      isAlerting={isAlerting}
      description={description}
    />
  );
}
