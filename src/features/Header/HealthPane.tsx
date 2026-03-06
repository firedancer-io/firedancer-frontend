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
import { clientAtom } from "../../atoms";
import { ClientEnum } from "../../api/entities";
import { networkProtocols } from "../Overview/LiveNetworkMetrics/consts";

function getStatusText(isAlerting: boolean) {
  return isAlerting ? "Unhealthy" : "Healthy";
}

interface HealthData {
  title: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
  isAlerting: boolean;
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

  if (isStacked) {
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
  isAlerting: boolean;
}
function HealthPopoverContent({
  title,
  description,
  isAlerting,
}: HealthPopoverContentProps) {
  return (
    <Flex direction="column" gap="4px">
      <Flex gap="5px">
        <Text className={styles.title}>{title}</Text>
        <Text
          className={clsx(styles.status, { [styles.alerting]: isAlerting })}
        >
          {getStatusText(isAlerting)}
        </Text>
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
  isAlerting,
  isStacked = false,
}: HealthBoxProps) {
  const ariaLabel = `${title}: ${getStatusText(isAlerting)}`;
  const className = clsx(styles.healthBox, {
    [styles.alerting]: isAlerting,
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
          isAlerting={isAlerting}
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

  const isAlerting = voteState === "delinquent";

  return useMemo(() => {
    return {
      title: "Vote Health",
      Icon: HowToVoteIcon,
      isAlerting,
      description: isAlerting
        ? voteSlot == null || turbineSlot == null
          ? "Missing vote slot or turbine slot data."
          : `We haven't landed a vote since slot ${voteSlot} (${voteSlot - turbineSlot}).`
        : "Our consensus votes are being received by other nodes normally.",
    };
  }, [isAlerting, voteSlot, turbineSlot]);
}

function useBundleHealthData(): HealthData | null {
  const blockEngine = useAtomValue(blockEngineAtom);

  return useMemo(() => {
    if (!blockEngine) return null;

    return {
      title: "Bundle Health",
      Icon: LayersIcon,
      isAlerting: blockEngine.status !== "connected",
      description: `Currently ${blockEngine.status} ${blockEngine.status === "disconnected" ? "from" : "to"} ${blockEngine.name} - ${blockEngine.url} (${blockEngine.ip})`,
    };
  }, [blockEngine]);
}

/**
 * 2.5 blocks/s
 * Ema threshold = 2.5 × 0.5^(5000 / half life).
 * Ema after 5 seconds of no blocks at 1_000ms half life = 0.09
 * choose threshold between 0.09 and 2.5
 */
const turbineSlotEmaOptions = {
  forceUpdateIntervalMs: 1_000,
  initMinSamples: 2,
  halfLifeMs: 1_000,
};
const turbineEmaThreshold = 0.5;

/**
 * Turbine health data, with checks dependent on client
 */
function useTurbineHealthData(): HealthData {
  const turbineSlot = useAtomValue(turbineSlotAtom);
  const isTurbineSlotMissing = turbineSlot == null;

  const { ema: turbineSlotRate } = useEma(turbineSlot, turbineSlotEmaOptions);
  const isTurbineSlotAlerting =
    isTurbineSlotMissing ||
    (turbineSlotRate != null && turbineSlotRate < turbineEmaThreshold);

  const isNetworkAlerting = useIsTurbineNetworkMetricsAlerting();

  const isAlerting = isTurbineSlotAlerting && !!isNetworkAlerting;

  return useMemo(() => {
    return {
      title: "Turbine Health",
      Icon: CycloneIcon,
      isAlerting,
      description: isAlerting
        ? isTurbineSlotMissing
          ? "Missing turbine slot data."
          : "We are receiving little to no block data from other nodes over Turbine."
        : "Block data is arriving normally over Turbine.",
    };
  }, [isAlerting, isTurbineSlotMissing]);
}

const turbineIdx = networkProtocols.indexOf("turbine");
const repairIdx = networkProtocols.indexOf("repair");

/**
 * For non-Frankendancer, alert if turbine rate < replay rate
 */
function useIsTurbineNetworkMetricsAlerting() {
  const isFrankendancer = useAtomValue(clientAtom) === ClientEnum.Frankendancer;

  const emaOptions = useMemo(() => {
    return isFrankendancer
      ? {
          // no updates
          forceUpdateIntervalMs: undefined,
        }
      : {
          halfLifeMs: 1_000,
        };
  }, [isFrankendancer]);

  // network metrics check for non-Frankendancer
  const liveNetworkMetrics = useAtomValue(liveNetworkMetricsAtom);
  const turbineRate = useEmaValue(
    isFrankendancer ? null : liveNetworkMetrics?.ingress[turbineIdx],
    emaOptions,
  );
  const repairRate = useEmaValue(
    isFrankendancer ? null : liveNetworkMetrics?.ingress[repairIdx],
    emaOptions,
  );

  if (isFrankendancer) return;
  return turbineRate < repairRate;
}

const REPLAY_ALERT_THRESHOLD_SLOTS = 12;
function useReplayHealthData(): HealthData {
  const turbineSlot = useAtomValue(turbineSlotAtom);
  const processedSlot = useAtomValue(completedSlotAtom);

  return useMemo(() => {
    const isAlerting =
      turbineSlot == null ||
      processedSlot == null ||
      turbineSlot - processedSlot > REPLAY_ALERT_THRESHOLD_SLOTS;

    return {
      title: "Replay Health",
      Icon: ReplayIcon,
      isAlerting,
      description: isAlerting
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
