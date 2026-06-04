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
import { blockEngineAtom, healthAtom } from "../../api/atoms";
import PopoverDropdown from "../../components/PopoverDropdown";
import type {
  BundleHealth,
  ReplayHealth,
  TurbineHealth,
  VoteHealth,
} from "../../api/types";
import { startCase } from "lodash";

enum HealthStatus {
  Healthy,
  Unhealthy,
  Intermediate,
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

interface HealthStatusData {
  status: HealthStatus;
  description: string;
}

function getVoteHealthData(state?: VoteHealth): HealthStatusData | undefined {
  switch (state) {
    case "not_started":
      return {
        status: HealthStatus.Intermediate,
        description:
          "The tower tile exists but is not yet running, or the validator has not yet produced a vote.",
      };
    case "delinquent":
      return {
        status: HealthStatus.Unhealthy,
        description:
          "The validator is voting but the latest landed vote is greater than 150 slots behind the replay slot, or the vote slot has not advanced in over 60 seconds.",
      };
    case "voting":
      return {
        status: HealthStatus.Healthy,
        description: "The validator is landing votes on-chain.",
      };
    case "disabled":
    case undefined:
      return;
  }
}

function getBundleHealthData(
  state?: BundleHealth,
): HealthStatusData | undefined {
  switch (state) {
    case "disconnected":
      return {
        status: HealthStatus.Unhealthy,
        description:
          "All bundle tiles are disconnected from their block engine.",
      };
    case "connecting":
      return {
        status: HealthStatus.Intermediate,
        description:
          "At least one bundle tile is attempting to connect, but none are connected or sleeping.",
      };
    case "connected":
      return {
        status: HealthStatus.Healthy,
        description:
          "At least one bundle tile has an active connection to its block engine.",
      };
    case "sleeping":
      return {
        status: HealthStatus.Healthy,
        description:
          "At least one bundle tile is deliberately sleeping before reconnecting.",
      };
    case "disabled":
    case undefined:
      return;
  }
}

function getReplayHealthData(
  state?: ReplayHealth,
): HealthStatusData | undefined {
  switch (state) {
    case "not_started":
      return {
        status: HealthStatus.Intermediate,
        description:
          "The replay tile exists but is not yet running, or the turbine slot or reset slot is zero.",
      };
    case "behind":
      return {
        status: HealthStatus.Unhealthy,
        description:
          "The gap between the turbine slot and the reset slot exceeds 12 slots, or the reset slot has not advanced in over 12 seconds.",
      };
    case "running":
      return {
        status: HealthStatus.Healthy,
        description:
          "The replay tile is keeping up with incoming turbine data.",
      };
    case "disabled":
    case undefined:
      return;
  }
}

function getTurbineHealthData(
  state?: TurbineHealth,
): HealthStatusData | undefined {
  switch (state) {
    case "not_started":
      return {
        status: HealthStatus.Intermediate,
        description:
          "The relevant tiles exist but are not yet all running, or the turbine slot is zero.",
      };
    case "stalled":
      return {
        status: HealthStatus.Unhealthy,
        description: "The turbine slot has not advanced in over 12 seconds.",
      };
    case "repair_outpacing":
      return {
        status: HealthStatus.Unhealthy,
        description:
          "Turbine slot is advancing, but repair byte throughput has exceeded turbine byte throughput over the last 12-second window, indicating degraded turbine connectivity.",
      };
    case "running":
      return {
        status: HealthStatus.Healthy,
        description:
          "Turbine is receiving shreds and its throughput exceeds repair.",
      };
    case "disabled":
    case undefined:
      return;
  }
}

function useBlockEngineDescription(): string | undefined {
  const blockEngine = useAtomValue(blockEngineAtom);
  return blockEngine
    ? `Block Engine: ${blockEngine.name} - ${blockEngine.url}${blockEngine.ip ? ` (${blockEngine.ip})` : ""}`
    : undefined;
}

function useHealthData(): HealthData[] {
  const { vote, bundle, turbine, replay } = useAtomValue(healthAtom) ?? {};
  const voteData = useMemo(() => {
    const data = getVoteHealthData(vote);
    if (!data) return;

    return {
      ...data,
      title: "Vote Health",
      Icon: HowToVoteIcon,
      statusText: startCase(vote),
    };
  }, [vote]);

  const blockEngineDescription = useBlockEngineDescription();
  const bundleData = useMemo(() => {
    const data = getBundleHealthData(bundle);
    if (!data) return;

    const description = blockEngineDescription
      ? `${data.description}\n${blockEngineDescription}`
      : data.description;

    return {
      ...data,
      title: "Bundle Health",
      Icon: LayersIcon,
      statusText: startCase(bundle),
      description,
    };
  }, [blockEngineDescription, bundle]);

  const turbineData = useMemo(() => {
    const data = getTurbineHealthData(turbine);
    if (!data) return;

    return {
      ...data,
      title: "Turbine Health",
      Icon: CycloneIcon,
      statusText: startCase(turbine),
    };
  }, [turbine]);

  const replayData = useMemo(() => {
    const data = getReplayHealthData(replay);
    if (!data) return;

    return {
      ...data,
      title: "Replay Health",
      Icon: ReplayIcon,
      statusText: startCase(replay),
    };
  }, [replay]);

  const healthData = [voteData, bundleData, turbineData, replayData].filter(
    (d) => d != null,
  );
  return healthData;
}
