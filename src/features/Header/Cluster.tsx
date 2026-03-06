import { useAtomValue } from "jotai";
import {
  clusterAtom,
  versionAtom,
  commitHashAtom,
  scheduleStrategyAtom,
} from "../../api/atoms";
import { Text, Tooltip, Flex } from "@radix-ui/themes";
import styles from "./cluster.module.css";
import connectedIcon from "../../assets/power.svg";
import reconnectingIcon from "../../assets/power_off_orange.svg";
import disconnectedIcon from "../../assets/power_off_red.svg";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { ScheduleStrategyEnum } from "../../api/entities";
import { ScheduleStrategyIcon } from "../../components/ScheduleStrategyIcon";
import { clusterIndicatorHeight, slotsListWidth } from "../../consts";
import { getClusterColor } from "../../utils";
import { useMemo } from "react";

const offset = 2;

export function Cluster() {
  const cluster = useAtomValue(clusterAtom);
  const version = useAtomValue(versionAtom);
  const commitHash = useAtomValue(commitHashAtom);
  const socketState = useAtomValue(socketStateAtom);

  if (!cluster && !version) return null;

  let icon = disconnectedIcon;
  if (socketState === SocketState.Connected) {
    icon = connectedIcon;
  } else if (socketState === SocketState.Connecting) {
    icon = reconnectingIcon;
  }

  let clusterText: string | undefined = cluster;
  if (cluster === "mainnet-beta") {
    clusterText = "mainnet";
  }

  return (
    <Flex
      width={`${slotsListWidth + offset}px`}
      className={styles.clusterContainer}
      gap="5px"
      ml={`-${offset}px`}
      p={`${offset}px 5px ${offset}px ${offset}px`}
    >
      <Flex
        className={styles.cluster}
        flexGrow="1"
        direction="column"
        align="center"
        style={{ background: getClusterColor(cluster) }}
      >
        <Tooltip content="Cluster the validator is joined to">
          <Text className={styles.clusterName}>{clusterText}</Text>
        </Tooltip>

        <Tooltip
          content={`Current validator software version. Commit Hash: ${commitHash || "unknown"}`}
        >
          <Text>v{version}</Text>
        </Tooltip>
      </Flex>

      <Tooltip
        content={`GUI is currently ${socketState} ${socketState === SocketState.Disconnected ? "from" : "to"} the validator`}
      >
        <img src={icon} className={styles.wsStatusIcon} alt="ws status" />
      </Tooltip>

      <StrategyIcon />
    </Flex>
  );
}

export function CluserIndicator() {
  const cluster = useAtomValue(clusterAtom);
  const color = getClusterColor(cluster);

  return (
    <div
      style={{
        background: color,
        height: clusterIndicatorHeight,
        width: "100%",
      }}
    />
  );
}

function StrategyIcon() {
  const scheduleStrategy = useAtomValue(scheduleStrategyAtom);
  const tooltipContent = useMemo(() => {
    if (scheduleStrategy === ScheduleStrategyEnum.balanced) {
      return "Transaction scheduler strategy: balanced";
    } else if (scheduleStrategy === ScheduleStrategyEnum.perf) {
      return "Transaction scheduler strategy: performance";
    } else if (scheduleStrategy === ScheduleStrategyEnum.revenue) {
      return "Transaction scheduler strategy: revenue";
    }
  }, [scheduleStrategy]);

  if (!scheduleStrategy) return;

  return (
    <ScheduleStrategyIcon
      strategy={scheduleStrategy}
      iconSize={12}
      tooltipContent={tooltipContent}
    />
  );
}
