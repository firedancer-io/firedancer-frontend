import { useAtomValue } from "jotai";
import {
  blockEngineAtom,
  clusterAtom,
  versionAtom,
  commitHashAtom,
  scheduleStrategyAtom,
} from "../../api/atoms";
import { Text, Tooltip } from "@radix-ui/themes";
import styles from "./cluster.module.css";
import connectedIcon from "../../assets/power.svg";
import reconnectingIcon from "../../assets/power_off_orange.svg";
import disconnectedIcon from "../../assets/power_off_red.svg";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { useMedia } from "react-use";
import type {
  BlockEngineUpdate,
  Cluster as ClusterType,
} from "../../api/types";
import {
  clusterDevelopmentColor,
  clusterDevnetColor,
  clusterMainnetBetaColor,
  clusterPythnetColor,
  clusterPythtestColor,
  clusterTestnetColor,
  clusterUnknownColor,
  connectedColor,
  connectingColor,
  failureColor,
} from "../../colors";
import { ScheduleStrategyEnum } from "../../api/entities";

export function Cluster() {
  const cluster = useAtomValue(clusterAtom);
  const version = useAtomValue(versionAtom);
  const commitHash = useAtomValue(commitHashAtom);
  const socketState = useAtomValue(socketStateAtom);
  const isWideScreen = useMedia("(min-width: 600px)");

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
    <div className={styles.cluster}>
      <Tooltip content="Cluster the validator is joined to">
        <Text
          className={styles.clusterName}
          style={{ background: getClusterColor(cluster) }}
        >
          {clusterText}
        </Text>
      </Tooltip>
      {isWideScreen && (
        <Tooltip
          content={`Current validator software version. Commit Hash: ${commitHash || "unknown"}`}
        >
          <Text className={styles.version}>v{version}</Text>
        </Tooltip>
      )}
      <Tooltip
        content={`GUI is currently ${socketState} ${socketState === SocketState.Disconnected ? "from" : "to"} the validator`}
      >
        <img src={icon} alt="ws status" />
      </Tooltip>

      <JitoIcon />

      <StrategyIcon />
    </div>
  );
}

export function CluserIndicator() {
  const cluster = useAtomValue(clusterAtom);
  const color = getClusterColor(cluster);

  return <div className={styles.indicator} style={{ background: color }} />;
}

function getClusterColor(cluster?: ClusterType) {
  switch (cluster) {
    case "mainnet-beta":
      return clusterMainnetBetaColor;
    case "testnet":
      return clusterTestnetColor;
    case "development":
      return clusterDevelopmentColor;
    case "devnet":
      return clusterDevnetColor;
    case "pythnet":
      return clusterPythnetColor;
    case "pythtest":
      return clusterPythtestColor;
    case "unknown":
    case undefined:
      return clusterUnknownColor;
  }
}

function getBlockEngineFill(blockEngineUpdate: BlockEngineUpdate) {
  switch (blockEngineUpdate.status) {
    case "connected":
      return connectedColor;
    case "connecting":
      return connectingColor;
    case "disconnected":
      return failureColor;
  }
}

function JitoIcon() {
  const blockEngine = useAtomValue(blockEngineAtom);
  if (!blockEngine) return null;

  const fill = getBlockEngineFill(blockEngine);

  return (
    <Tooltip
      content={`Currently ${blockEngine.status} ${blockEngine.status === "disconnected" ? "from" : "to"} ${blockEngine.name} - ${blockEngine.url} (${blockEngine.ip})`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 48 48"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="0.957031"
          y="0.478027"
          width="46.6736"
          height="46.6736"
          rx="23.3368"
          fill={fill}
        />
        <circle
          cx="24.29"
          cy="23.5771"
          r="18.6313"
          stroke={fill}
          strokeWidth="1.62011"
        />
        <path
          d="M26.1499 19.0332C24.8137 19.9555 23.3768 20.2715 21.842 19.9795C20.3046 19.6893 19.0833 18.8857 18.1757 17.5706L16.8251 15.6137L18.7625 14.2765L20.1131 16.2334C20.6504 17.012 21.3676 17.4839 22.2672 17.6474C23.1642 17.8126 24.0091 17.6217 24.7967 17.0781L28.2146 14.7043C29.301 13.9499 30.7935 14.2212 31.5448 15.3097L26.1499 19.0332Z"
          fill={fill}
        />
        <path
          d="M28.7658 25.5351C27.8418 24.1963 27.5235 22.7579 27.8126 21.2226C28.0999 19.6846 28.9007 18.464 30.2133 17.558L32.1665 16.21L33.5062 18.1511L31.5531 19.4991C30.776 20.0355 30.3057 20.7523 30.1439 21.6522C29.9803 22.5495 30.1726 23.3953 30.7172 24.1844L33.1006 27.6163C33.8536 28.7006 33.5828 30.1903 32.4963 30.9402L28.7658 25.5351Z"
          fill={fill}
        />
        <path
          d="M22.2392 28.1641C23.5755 27.2418 25.0123 26.9258 26.5471 27.2178C28.0846 27.508 29.3058 28.3116 30.2135 29.6267L31.5641 31.5835L29.6267 32.9207L28.2761 30.9638C27.7387 30.1853 27.0215 29.7134 26.1219 29.5499C25.2249 29.3846 24.38 29.5756 23.5924 30.1191L20.1745 32.4929C19.0882 33.2474 17.5956 32.9761 16.8443 31.8875L22.2392 28.1641Z"
          fill={fill}
        />
        <path
          d="M19.7405 21.8316C20.6645 23.1704 20.9829 24.6088 20.6938 26.1441C20.4065 27.6821 19.6056 28.9027 18.293 29.8087L16.3398 31.1567L15.0001 29.2156L16.9533 27.8676C17.7304 27.3312 18.2007 26.6144 18.3625 25.7145C18.5261 24.8172 18.3338 23.9714 17.7892 23.1823L15.4058 19.7504C14.6527 18.6661 14.9235 17.1764 16.01 16.4265L19.7405 21.8316Z"
          fill={fill}
        />
      </svg>
    </Tooltip>
  );
}

function StrategyIcon() {
  const scheduleStrategy = useAtomValue(scheduleStrategyAtom);

  if (scheduleStrategy === ScheduleStrategyEnum.balanced) {
    return (
      <Tooltip content="Transaction scheduler strategy: balanced">
        <div>⚖️</div>
      </Tooltip>
    );
  } else if (scheduleStrategy === ScheduleStrategyEnum.perf) {
    return (
      <Tooltip content="Transaction scheduler strategy: performance">
        <div style={{ margin: "0 -2px" }}>⚡</div>
      </Tooltip>
    );
  } else if (scheduleStrategy === ScheduleStrategyEnum.revenue) {
    return (
      <Tooltip content="Transaction scheduler strategy: revenue">
        <div>📊</div>
      </Tooltip>
    );
  }
}
