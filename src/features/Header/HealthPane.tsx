import { Flex, Text } from "@radix-ui/themes";
import HowToVoteIcon from "@material-design-icons/svg/filled/how_to_vote.svg?react";
import LayersIcon from "@material-design-icons/svg/filled/layers.svg?react";
import CycloneIcon from "@material-design-icons/svg/filled/cyclone.svg?react";
import ReplayIcon from "@material-design-icons/svg/filled/replay_circle_filled.svg?react";
import { useMemo, type FC, type SVGProps } from "react";
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
import { networkProtocols } from "../Overview/LiveNetworkMetrics/consts";
import { isFiredancer, isFrankendancer } from "../../client";
import { bootProgressPhaseAtom } from "../StartupProgress/atoms";

enum HealthStatus {
  Healthy,
  Unhealthy,
  Intermediate,
}

function getDefaultStatusText(status: HealthStatus) {
  switch (status) {
    case HealthStatus.Unhealthy:
      return "Unhealthy";
    case HealthStatus.Healthy:
      return "Healthy";
    case HealthStatus.Intermediate:
      return "Unknown";
  }
}

interface HealthData {
  title: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
  status: HealthStatus;
  statusText: string;
  description: string;
}

/**
 * Health pane with popover details. Combine popovers to a single large one
 * if the buttons are stacked.
 */
export default function HealthPane() {
  const isStacked = useMedia("(max-width: 450px)");
  const isNarrow = useMedia("(max-width: 390px)");

  const healthData = useHealthData();

  const ariaLabel = "Health Pane";
  const className = clsx(styles.healthPane, {
    [styles.narrow]: isNarrow,
  });

  if (isStacked && healthData.length > 1) {
    return (
      <PopoverDropdown
        className={styles.popover}
        content={
          <Flex direction="column" gap="8px">
            {healthData.map((data) => (
              <HealthPopoverContent key={data.title} {...data} />
            ))}
          </Flex>
        }
      >
        <button
          aria-label={ariaLabel}
          className={clsx(className, styles.vertical)}
        >
          {healthData.map((data) => (
            <HealthBox key={data.title} {...data} isStacked />
          ))}
        </button>
      </PopoverDropdown>
    );
  }

  return (
    <div aria-label={ariaLabel} className={className}>
      {healthData.map((data) => (
        <HealthBox key={data.title} {...data} />
      ))}
    </div>
  );
}

interface HealthPopoverContentProps {
  title: string;
  description: string;
  status: HealthStatus;
  statusText: string;
}
function HealthPopoverContent({
  title,
  description,
  status,
  statusText,
}: HealthPopoverContentProps) {
  return (
    <Flex direction="column" gap="4px">
      <Flex gap="5px">
        <Text className={styles.title}>{title}</Text>
        {statusText && (
          <Text
            className={clsx(styles.status, {
              [styles.unhealthy]: status === HealthStatus.Unhealthy,
              [styles.intermediate]: status === HealthStatus.Intermediate,
            })}
          >
            {statusText}
          </Text>
        )}
      </Flex>
      <div className={styles.content}>
        <Text>{description}</Text>
      </div>
    </Flex>
  );
}

interface HealthBoxProps extends HealthData {
  isStacked?: boolean;
}
function HealthBox({
  title,
  description,
  Icon,
  status,
  statusText,
  isStacked = false,
}: HealthBoxProps) {
  const ariaLabel = `${title}: ${statusText}`;
  const className = clsx(styles.healthBox, {
    [styles.unhealthy]: status === HealthStatus.Unhealthy,
    [styles.intermediate]: status === HealthStatus.Intermediate,
  });

  if (isStacked) {
    return (
      <div aria-label={ariaLabel} className={clsx(className, styles.stacked)} />
    );
  }

  return (
    <PopoverDropdown
      className={styles.popover}
      content={
        <HealthPopoverContent
          title={title}
          description={description}
          status={status}
          statusText={statusText}
        />
      }
    >
      <button aria-label={ariaLabel} className={className}>
        <Icon width="75%" />
      </button>
    </PopoverDropdown>
  );
}

function useVoteHealthData(): HealthData {
  const voteState = useAtomValue(voteStateAtom);
  const voteSlot = useAtomValue(voteSlotAtom);
  const turbineSlot = useAtomValue(turbineSlotAtom);
  const isCatchingUpPhase =
    useAtomValue(bootProgressPhaseAtom) === "catching_up" && isFiredancer;

  return useMemo(() => {
    const status = isCatchingUpPhase
      ? HealthStatus.Intermediate
      : voteState === "delinquent"
        ? HealthStatus.Unhealthy
        : HealthStatus.Healthy;

    const statusText =
      status === HealthStatus.Intermediate
        ? "Catching Up"
        : getDefaultStatusText(status);

    const description =
      status === HealthStatus.Intermediate
        ? "Catching up."
        : status === HealthStatus.Healthy
          ? "Our consensus votes are being received by other nodes normally."
          : voteSlot == null || turbineSlot == null
            ? "Missing vote slot or turbine slot data."
            : `We haven't landed a vote since slot ${voteSlot} (${voteSlot - turbineSlot}).`;

    return {
      title: "Vote Health",
      Icon: HowToVoteIcon,
      status,
      statusText,
      description,
    };
  }, [isCatchingUpPhase, voteState, voteSlot, turbineSlot]);
}

function useBundleHealthData(): HealthData | null {
  const blockEngine = useAtomValue(blockEngineAtom);

  return useMemo(() => {
    if (!blockEngine) return null;

    const status =
      blockEngine.status === "connected" || blockEngine.status === "sleeping"
        ? HealthStatus.Healthy
        : blockEngine.status === "connecting"
          ? HealthStatus.Intermediate
          : HealthStatus.Unhealthy;

    const statusPhrase =
      blockEngine.status === "sleeping"
        ? "sleeping and disconnected from"
        : blockEngine.status === "disconnected"
          ? `${blockEngine.status} from`
          : `${blockEngine.status} to`;

    return {
      title: "Bundle Health",
      Icon: LayersIcon,
      status,
      statusText:
        status === HealthStatus.Intermediate
          ? "Connecting"
          : getDefaultStatusText(status),
      description: `Currently ${statusPhrase} ${blockEngine.name} - ${blockEngine.url} (${blockEngine.ip})`,
    };
  }, [blockEngine]);
}

const noUpdateEmaOptions = {
  // no updates
  forceUpdateIntervalMs: undefined,
};
/**
 * 2.5 blocks/s
 * Ema threshold = 2.5 × 0.5^(5000 / half life).
 * Ema after 5 seconds of no blocks at 1_000ms half life = 0.09
 * choose threshold between 0.09 and 2.5
 */
const turbineSlotEmaOptions = isFrankendancer
  ? noUpdateEmaOptions
  : {
      forceUpdateIntervalMs: 1_000,
      initMinSamples: 2,
      halfLifeMs: 1_000,
    };
const turbineEmaThreshold = 0.5;

const turbineNetworkEmaOptions = isFrankendancer
  ? noUpdateEmaOptions
  : {
      halfLifeMs: 1_000,
    };

/**
 * Turbine health for Firedancer
 */
function useTurbineHealthData(): HealthData | null {
  const turbineSlot = useAtomValue(turbineSlotAtom);
  const isTurbineSlotMissing = turbineSlot == null;

  const { ema: turbineSlotRate } = useEma(
    isFrankendancer ? null : turbineSlot,
    turbineSlotEmaOptions,
  );
  const isTurbineSlotAlerting =
    isTurbineSlotMissing ||
    (turbineSlotRate != null && turbineSlotRate < turbineEmaThreshold);

  // network metrics alert if turbine rate < repair rate
  const liveNetworkMetrics = useAtomValue(liveNetworkMetricsAtom);
  const turbineRate = useEmaValue(
    isFrankendancer ? null : liveNetworkMetrics?.ingress[turbineIdx],
    turbineNetworkEmaOptions,
  );
  const repairRate = useEmaValue(
    isFrankendancer ? null : liveNetworkMetrics?.ingress[repairIdx],
    turbineNetworkEmaOptions,
  );
  const isNetworkAlerting = turbineRate < repairRate;

  const isWaitingForSupermajorityPhase =
    useAtomValue(bootProgressPhaseAtom) === "waiting_for_supermajority" &&
    isFiredancer;

  const status = isWaitingForSupermajorityPhase
    ? HealthStatus.Intermediate
    : isTurbineSlotAlerting && isNetworkAlerting
      ? HealthStatus.Unhealthy
      : HealthStatus.Healthy;

  return useMemo(() => {
    if (isFrankendancer) return null;

    return {
      title: "Turbine Health",
      Icon: CycloneIcon,
      status,
      statusText:
        status === HealthStatus.Intermediate
          ? "Waiting for Supermajority"
          : getDefaultStatusText(status),
      description:
        status === HealthStatus.Intermediate
          ? "Waiting for supermajority."
          : status === HealthStatus.Unhealthy
            ? isTurbineSlotMissing
              ? "Missing turbine slot data."
              : "We are receiving little to no block data from other nodes over Turbine."
            : "Block data is arriving normally over Turbine.",
    };
  }, [isTurbineSlotMissing, status]);
}

const turbineIdx = networkProtocols.indexOf("turbine");
const repairIdx = networkProtocols.indexOf("repair");

const REPLAY_ALERT_THRESHOLD_SLOTS = 12;
/**
 * Replay health for Firedancer
 */
function useReplayHealthData(): HealthData | null {
  const turbineSlot = useAtomValue(turbineSlotAtom);
  const processedSlot = useAtomValue(completedSlotAtom);

  return useMemo(() => {
    if (isFrankendancer) return null;

    const status =
      turbineSlot == null ||
      processedSlot == null ||
      turbineSlot - processedSlot > REPLAY_ALERT_THRESHOLD_SLOTS
        ? HealthStatus.Unhealthy
        : HealthStatus.Healthy;

    return {
      title: "Replay Health",
      Icon: ReplayIcon,
      status,
      statusText: getDefaultStatusText(status),
      description:
        status === HealthStatus.Unhealthy
          ? turbineSlot == null || processedSlot == null
            ? "Missing turbine slot or processed slot data."
            : `Replay is ${turbineSlot - processedSlot} behind the rest of the cluster.`
          : "Replay is keeping up with the cluster.",
    };
  }, [turbineSlot, processedSlot]);
}

function useHealthData(): HealthData[] {
  const voteData = useVoteHealthData();
  const bundleData = useBundleHealthData();
  const turbineData = useTurbineHealthData();
  const replayData = useReplayHealthData();

  const healthData = [voteData, bundleData, turbineData, replayData].filter(
    (d) => d != null,
  );
  return healthData;
}
